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
)

// visitorCookie carries the anonymous key that owns a conversation. It is not
// an identity: it grants nothing except the right to keep talking in chats it
// already started.
const visitorCookie = "velt_visitor"

// cookieMaxAge keeps a visitor recognisable across a browsing session without
// becoming a long-lived tracker.
const cookieMaxAge = 7 * 24 * 3600

// Handler is the visitor-facing HTTP layer.
type Handler struct {
	svc    *Service
	secure bool
}

// NewHandler builds the visitor-facing handler. `secure` marks the cookie for
// HTTPS-only deployments.
func NewHandler(svc *Service, secure bool) *Handler {
	return &Handler{svc: svc, secure: secure}
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

// Send handles POST /api/public/chat/conversations/{id}/messages.
func (h *Handler) Send(w http.ResponseWriter, r *http.Request) {
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
// in. Ownership is the cookie, and the limiter is applied by the caller.
func RegisterPublic(r chi.Router, h *Handler) {
	r.Post("/api/public/chat/conversations", h.Start)
	r.Get("/api/public/chat/conversations/{id}", h.Transcript)
	r.Post("/api/public/chat/conversations/{id}/messages", h.Send)
	r.Get("/api/public/chat/conversations/{id}/stream", h.Stream)
	r.Post("/api/public/chat/conversations/{id}/handoff", h.Handoff)
}
