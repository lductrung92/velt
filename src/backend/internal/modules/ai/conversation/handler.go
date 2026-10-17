package conversation

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/ratelimit"
)

// visitorCookie carries the anonymous key that owns a conversation. It is not
// an identity: it grants nothing except the right to keep talking in chats it
// already started.
const visitorCookie = "velt_visitor"

// cookieMaxAge keeps a visitor recognisable across a browsing session without
// becoming a long-lived tracker.
const cookieMaxAge = 7 * 24 * 3600

// Per-IP ceilings for the one unauthenticated surface that spends money: every
// visitor message is a paid model call, and starting a conversation mints a
// fresh ai.max_turns budget. Without these, one script opens unlimited
// conversations and bills every one of them.
//
// These are NOT the spend ceiling — ai.daily_token_cap is, and past it the
// assistant degrades to the scripted bot. Their job is to stop a single caller
// draining that shared daily budget before anyone else gets to use it. Sizing
// follows from that: at 30 messages per 10 minutes one address needs more than
// a day of sustained flooding to exhaust the default cap on its own.
//
// Keyed by IP alone. The visitor cookie is attacker-supplied, so limiting on it
// stops nobody who matters. Mobile carriers here put many real users behind one
// CGNAT address, which is why the ceilings sit well above what a person can
// physically produce — a visitor cannot type faster than the model answers.
const (
	rlStartPerIP  = 30
	rlStartWindow = time.Hour

	rlSendPerIP  = 30
	rlSendWindow = 10 * time.Minute

	// Streams cost nothing to run but hold a connection; this caps the
	// reconnect churn of an EventSource that keeps dropping.
	rlStreamPerIP  = 60
	rlStreamWindow = time.Minute

	// Asking for a person is not a read: it moves the conversation and writes
	// a system line, and once somebody has a device registered it rings their
	// phone. Ten in ten minutes is far more than a visitor who means it.
	rlHandoffPerIP  = 10
	rlHandoffWindow = 10 * time.Minute

	// Reading your own transcript is cheap, but "cheap" is not "free" and this
	// endpoint had no ceiling at all. Set high enough that polling a live
	// conversation never trips it.
	rlReadPerIP  = 120
	rlReadWindow = time.Minute
)

// Handler is the visitor-facing HTTP layer.
type Handler struct {
	svc        *Service
	secure     bool
	limiter    ratelimit.Limiter
	trustProxy bool
}

// NewHandler builds the visitor-facing handler. `secure` marks the cookie for
// HTTPS-only deployments; limiter/trustProxy drive the per-IP abuse guard.
func NewHandler(svc *Service, secure bool, limiter ratelimit.Limiter, trustProxy bool) *Handler {
	return &Handler{svc: svc, secure: secure, limiter: limiter, trustProxy: trustProxy}
}

// throttle applies a per-IP ceiling. It writes the 429 itself and reports true
// when the caller must stop.
//
// A limiter error fails CLOSED. On this surface an unmeasurable burst costs real
// money, so a visitor who has to retry is the cheaper outcome — the same choice
// the login path makes.
func (h *Handler) throttle(w http.ResponseWriter, r *http.Request,
	action string, limit int, window time.Duration,
) bool {
	if h.limiter == nil {
		return false
	}
	ok, retryAfter, err := h.limiter.Allow(r.Context(),
		"chat:"+action+":ip:"+httpx.ClientIP(r, h.trustProxy), limit, window)
	if err != nil {
		httpx.WriteError(w, apperr.RateLimited(1))
		return true
	}
	if !ok {
		httpx.WriteError(w, apperr.RateLimited(retryAfter))
		return true
	}
	return false
}

// visitorKey reads the caller's key, minting one if this is their first visit.
func (h *Handler) visitorKey(w http.ResponseWriter, r *http.Request) string {
	if c, err := r.Cookie(visitorCookie); err == nil && len(c.Value) >= 16 {
		return c.Value
	}
	key := uuid.NewString()
	http.SetCookie(w, &http.Cookie{
		Name: visitorCookie, Value: key, Path: "/",
		MaxAge: cookieMaxAge, HttpOnly: true, Secure: h.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return key
}

// existingKey reads the key without minting one. Endpoints that act on a
// conversation need the caller to already have it.
func existingKey(r *http.Request) (string, bool) {
	c, err := r.Cookie(visitorCookie)
	if err != nil || len(c.Value) < 16 {
		return "", false
	}
	return c.Value, true
}

func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return uuid.Nil, false
	}
	return id, true
}

// Start handles POST /api/public/chat/conversations.
func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	if h.throttle(w, r, "start", rlStartPerIP, rlStartWindow) {
		return
	}
	var req StartRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	key := h.visitorKey(w, r)
	res, err := h.svc.Start(r.Context(), key, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// Current handles GET /api/public/chat/conversations/current.
//
// It reads the visitor cookie without minting one: a browser with no cookie
// has no thread to resume, and answering 404 is the whole answer. Minting here
// would hand a key to every crawler that loads the page.
func (h *Handler) Current(w http.ResponseWriter, r *http.Request) {
	if h.throttle(w, r, "read", rlReadPerIP, rlReadWindow) {
		return
	}
	key, ok := existingKey(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.Current(r.Context(), key)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Send handles POST /api/public/chat/conversations/{id}/messages.
func (h *Handler) Send(w http.ResponseWriter, r *http.Request) {
	if h.throttle(w, r, "send", rlSendPerIP, rlSendWindow) {
		return
	}
	key, ok := existingKey(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req SendRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Send(r.Context(), key, convID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// 202, not 200: the answer has not been produced yet. It arrives on the
	// stream.
	httpx.WriteJSON(w, http.StatusAccepted, res)
}

// Transcript handles GET /api/public/chat/conversations/{id}.
func (h *Handler) Transcript(w http.ResponseWriter, r *http.Request) {
	if h.throttle(w, r, "read", rlReadPerIP, rlReadWindow) {
		return
	}
	key, ok := existingKey(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	rows, err := h.svc.Transcript(r.Context(), key, convID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": rows})
}

// Stream handles GET /api/public/chat/conversations/{id}/stream.
//
// Server-sent events rather than a WebSocket: the model's answer already has to
// stream one way, and reusing that one pipe for staff replies means one less
// moving part — and SSE survives proxies that mangle upgrades.
func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	if h.throttle(w, r, "stream", rlStreamPerIP, rlStreamWindow) {
		return
	}
	key, ok := existingKey(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Owns(r.Context(), key, convID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.WriteError(w, apperr.Internal())
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Proxies that buffer would defeat the whole point of streaming.
	w.Header().Set("X-Accel-Buffering", "no")
	// The server's WriteTimeout applies to this connection too, and a stream is
	// long-lived by definition: left alone it cuts the visitor off mid-answer.
	// What ends this handler is the ping ticker failing or r.Context() closing.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	events, unsubscribe := h.svc.Hub().Subscribe(convID)
	defer unsubscribe()

	// Keeps intermediaries from closing an idle connection, and lets the client
	// notice a dead one.
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			_, _ = fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev, open := <-events:
			if !open {
				return
			}
			body, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, body)
			flusher.Flush()
		}
	}
}

// Handoff handles POST /api/public/chat/conversations/{id}/handoff.
func (h *Handler) Handoff(w http.ResponseWriter, r *http.Request) {
	if h.throttle(w, r, "handoff", rlHandoffPerIP, rlHandoffWindow) {
		return
	}
	key, ok := existingKey(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	state, err := h.svc.RequestHuman(r.Context(), key, convID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"state": state})
}

// RegisterPublic mounts the visitor-facing chat. No auth: a visitor never logs
// in — ownership is the cookie, and the per-IP ceilings live in the handler
// (see throttle). Nothing upstream throttles this surface.
func RegisterPublic(r chi.Router, h *Handler) {
	r.Post("/api/public/chat/conversations", h.Start)
	// Registered before the {id} route it shadows. chi gives static segments
	// priority anyway, but relying on that silently would make "current" a
	// reserved word nobody declared.
	r.Get("/api/public/chat/conversations/current", h.Current)
	r.Get("/api/public/chat/conversations/{id}", h.Transcript)
	r.Post("/api/public/chat/conversations/{id}/messages", h.Send)
	r.Get("/api/public/chat/conversations/{id}/stream", h.Stream)
	r.Post("/api/public/chat/conversations/{id}/handoff", h.Handoff)
}
