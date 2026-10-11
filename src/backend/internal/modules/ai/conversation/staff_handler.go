package conversation

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// StaffHandler is the console-facing HTTP layer. Everything behind it needs
// ai.chat.handle, enforced in the service.
type StaffHandler struct {
	svc *Service
}

// NewStaffHandler builds the console-facing handler.
func NewStaffHandler(svc *Service) *StaffHandler { return &StaffHandler{svc: svc} }

func staffIdentity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

// Inbox handles GET /api/chat/conversations.
func (h *StaffHandler) Inbox(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	rows, err := h.svc.Inbox(r.Context(), id, r.URL.Query().Get("state"), limit)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": rows})
}

// Transcript handles GET /api/chat/conversations/{id}.
func (h *StaffHandler) Transcript(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	rows, err := h.svc.StaffTranscript(r.Context(), id, convID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": rows})
}

// Claim handles POST /api/chat/conversations/{id}/claim.
func (h *StaffHandler) Claim(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Claim(r.Context(), id, convID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Release handles POST /api/chat/conversations/{id}/release.
func (h *StaffHandler) Release(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Release(r.Context(), id, convID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Close handles POST /api/chat/conversations/{id}/close.
func (h *StaffHandler) Close(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Close(r.Context(), id, convID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Reply handles POST /api/chat/conversations/{id}/messages.
func (h *StaffHandler) Reply(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req StaffMessageRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	msg, err := h.svc.StaffReply(r.Context(), id, convID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, msg)
}

// Presence handles POST /api/chat/presence — the "I am at my desk" heartbeat.
func (h *StaffHandler) Presence(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	n, err := h.svc.Beat(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"online": n})
}

// Stream handles GET /api/chat/conversations/{id}/stream — the member's live
// view of one conversation, fed by the same hub the visitor reads.
func (h *StaffHandler) Stream(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	convID, ok := pathID(w, r)
	if !ok {
		return
	}
	// Reuses the permission check on the transcript: if they may not read it,
	// they may not watch it either.
	if _, err := h.svc.StaffTranscript(r.Context(), id, convID); err != nil {
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
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	events, unsubscribe := h.svc.Hub().Subscribe(convID)
	defer unsubscribe()

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

// RegisterStaff mounts the console-facing inbox behind auth.
func RegisterStaff(r chi.Router, h *StaffHandler, authMW func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/chat/conversations", h.Inbox)
		r.Post("/api/chat/presence", h.Presence)
		r.Get("/api/chat/conversations/{id}", h.Transcript)
		r.Get("/api/chat/conversations/{id}/stream", h.Stream)
		r.Post("/api/chat/conversations/{id}/claim", h.Claim)
		r.Post("/api/chat/conversations/{id}/release", h.Release)
		r.Post("/api/chat/conversations/{id}/close", h.Close)
		r.Post("/api/chat/conversations/{id}/messages", h.Reply)
	})
}

// --- admin surface ("Trợ lý AI" screen) ---

// Status handles GET /api/ai/status.
func (h *StaffHandler) Status(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Status(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Usage handles GET /api/ai/usage.
func (h *StaffHandler) Usage(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	res, err := h.svc.Usage(r.Context(), id, days)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Models handles GET /api/ai/models.
func (h *StaffHandler) Models(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	names, err := h.svc.Models(r.Context(), id)
	if err != nil {
		// Not every endpoint lists its models, and that is not a failure of the
		// screen — report it as data so the field stays usable by hand.
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"items": []string{}, "error": err.Error(),
		})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": names})
}

// Test handles POST /api/ai/test.
func (h *StaffHandler) Test(w http.ResponseWriter, r *http.Request) {
	id, ok := staffIdentity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Test(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// 200 even when the test failed: a failed probe is a finding to display,
	// not an error in the request that asked for it.
	httpx.WriteJSON(w, http.StatusOK, res)
}

// RegisterAdmin mounts the assistant's admin surface behind auth.
func RegisterAdmin(r chi.Router, h *StaffHandler, authMW func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/ai/status", h.Status)
		r.Get("/api/ai/usage", h.Usage)
		r.Get("/api/ai/models", h.Models)
		r.Post("/api/ai/test", h.Test)
	})
}
