package notify

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the console's surface for managing its own notification devices.
type Handler struct {
	svc *Service
	log *slog.Logger
}

// NewHandler wires the handler.
func NewHandler(svc *Service, log *slog.Logger) *Handler {
	return &Handler{svc: svc, log: log}
}

// caller returns the signed-in operator, or writes the refusal and returns
// nil. The gate is the chat permission rather than a settings one: these are
// the person's own devices, and the only thing they can ever be told about is
// a chat they are allowed to answer.
func (h *Handler) caller(w http.ResponseWriter, r *http.Request) *httpx.Identity {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil
	}
	if !id.Has(permHandle) {
		httpx.WriteError(w, apperr.AccessDenied("access_denied"))
		return nil
	}
	return id
}

// PublicKey handles GET /api/notify/push/key.
func (h *Handler) PublicKey(w http.ResponseWriter, r *http.Request) {
	if h.caller(w, r) == nil {
		return
	}
	key, err := h.svc.PublicKey(r.Context())
	if err != nil {
		h.fail(w, "public key", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, PublicKeyResponse{PublicKey: key})
}

// SendTest handles POST /api/notify/push/test: a notification to the
// caller's own browsers, so the chain can be exercised without waiting for a
// visitor to turn up.
func (h *Handler) SendTest(w http.ResponseWriter, r *http.Request) {
	id := h.caller(w, r)
	if id == nil {
		return
	}
	res, err := h.svc.SendTest(r.Context(), id.UserID)
	if err != nil {
		h.fail(w, "send test", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// ListDevices handles GET /api/notify/push/devices.
func (h *Handler) ListDevices(w http.ResponseWriter, r *http.Request) {
	id := h.caller(w, r)
	if id == nil {
		return
	}
	items, err := h.svc.Subscriptions(r.Context(), id.UserID)
	if err != nil {
		h.fail(w, "list devices", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, SubscriptionsResponse{Items: items})
}

// Subscribe handles POST /api/notify/push/devices.
func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	id := h.caller(w, r)
	if id == nil {
		return
	}
	var req SubscribeRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Subscribe(r.Context(), id.UserID, req); err != nil {
		h.fail(w, "subscribe", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Unsubscribe handles DELETE /api/notify/push/devices/{id}.
func (h *Handler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	caller := h.caller(w, r)
	if caller == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	if err := h.svc.Unsubscribe(r.Context(), caller.UserID, id); err != nil {
		h.fail(w, "unsubscribe", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Routes mounts the device endpoints. The caller supplies authentication.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/push/key", h.PublicKey)
	r.Get("/push/devices", h.ListDevices)
	r.Post("/push/devices", h.Subscribe)
	r.Delete("/push/devices/{id}", h.Unsubscribe)
	r.Post("/push/test", h.SendTest)
}

// fail maps a store error onto the wire. A missing row is a 404; anything else
// is logged rather than echoed, because the text can carry a push endpoint URL.
func (h *Handler) fail(w http.ResponseWriter, op string, err error) {
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	h.log.Error("notify: "+op, "err", err)
	httpx.WriteError(w, apperr.Internal())
}
