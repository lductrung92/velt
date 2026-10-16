package activity

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the HTTP layer for the activity log.
type Handler struct {
	svc *Service
}

// NewHandler builds the activity handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func identity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

// queryUUID reads an optional uuid param. A malformed one is a client mistake,
// not "no filter": silently dropping it would answer a question nobody asked.
func queryUUID(r *http.Request, name string) (*uuid.UUID, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, apperr.Validation(map[string]string{name: "invalid_uuid"})
	}
	return &id, nil
}

// queryTime reads an optional instant. RFC3339 is what the console sends; a
// bare date is accepted too because this endpoint gets reached by hand, and an
// end date then means the end of that day rather than its first instant.
func queryTime(r *http.Request, name string, endOfDay bool) (time.Time, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return time.Time{}, nil
	}
	if ts, err := time.Parse(time.RFC3339, raw); err == nil {
		return ts, nil
	}
	day, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return time.Time{}, apperr.Validation(map[string]string{name: "invalid_date"})
	}
	if endOfDay {
		day = day.Add(24*time.Hour - time.Nanosecond)
	}
	return day, nil
}

func listParams(r *http.Request) (ListParams, error) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("page_size"))
	p := ListParams{
		Query:    strings.TrimSpace(q.Get("q")),
		Action:   strings.TrimSpace(q.Get("action")),
		Entity:   strings.TrimSpace(q.Get("entity")),
		Page:     page,
		PageSize: size,
	}
	var err error
	if p.ActorID, err = queryUUID(r, "actor_id"); err != nil {
		return p, err
	}
	if p.EntityID, err = queryUUID(r, "entity_id"); err != nil {
		return p, err
	}
	if p.From, err = queryTime(r, "from", false); err != nil {
		return p, err
	}
	if p.To, err = queryTime(r, "to", true); err != nil {
		return p, err
	}
	return p, nil
}

// List handles GET /api/activity.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	p, err := listParams(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.List(r.Context(), id, p)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Actions handles GET /api/activity/actions.
func (h *Handler) Actions(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Actions(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Purge handles POST /api/activity/purge.
func (h *Handler) Purge(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	var req PurgeRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Purge(r.Context(), id, strings.TrimSpace(req.OlderThan))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Register mounts the activity routes behind authMW. Reads are gated by
// activity.read and the purge by activity.purge, both in the service layer.
func Register(r chi.Router, svc *Service, authMW func(http.Handler) http.Handler) {
	h := NewHandler(svc)
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/activity", h.List)
		r.Get("/api/activity/actions", h.Actions)
		r.Post("/api/activity/purge", h.Purge)
	})
}
