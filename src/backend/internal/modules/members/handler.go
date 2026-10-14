package members

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// avatarOverhead is slack added over the configured max to allow for multipart
// framing (boundaries, headers) so a file exactly at the cap is not rejected by
// the body reader before the service can check it.
const avatarOverhead = 1 << 20 // 1 MiB

// Handler is the HTTP layer for members. It decodes/validates, delegates to the
// service, and writes the response — no business rules live here.
type Handler struct {
	svc *Service
}

// NewHandler builds the members HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// identity pulls the authenticated caller; absent means the route was mounted
// without the auth middleware, which is a wiring bug.
func identity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

// pathID parses the {id} path parameter.
func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return uuid.Nil, false
	}
	return id, true
}

func listParams(r *http.Request) ListParams {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("page_size"))
	return ListParams{
		Query:      strings.TrimSpace(q.Get("q")),
		ActiveOnly: q.Get("active") == "true",
		Page:       page,
		PageSize:   size,
		Locale:     q.Get("locale"),
	}
}

// staffListParams adds the console-only created-at range on top of the params
// the public roster shares. The range stays out of listParams so ListPublic
// keeps exactly the contract it had.
func staffListParams(r *http.Request) (ListParams, error) {
	p := listParams(r)
	var err error
	if p.CreatedFrom, p.CreatedTo, err = httpx.QueryDateRange(r, "created_from", "created_to"); err != nil {
		return ListParams{}, err
	}
	return p, nil
}

// List handles GET /api/members.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	p, err := staffListParams(r)
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

// Get handles GET /api/members/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	memberID, ok := pathID(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Get(r.Context(), id, memberID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Create handles POST /api/members.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	var req CreateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Create(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// Update handles PATCH /api/members/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	memberID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Update(r.Context(), id, memberID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Delete handles DELETE /api/members/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	memberID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), id, memberID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// Reorder handles PUT /api/members/order.
func (h *Handler) Reorder(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	var req ReorderRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Reorder(r.Context(), id, req.IDs); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// UploadAvatar handles POST /api/members/{id}/avatar (multipart, field "file").
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	memberID, ok := pathID(w, r)
	if !ok {
		return
	}
	// Bound the body before parsing so an oversized upload is rejected without
	// buffering it all; the service re-checks the exact cap on the decoded file.
	// Parse explicitly rather than letting FormFile do it, so a body over the
	// cap surfaces as 413 instead of a misleading "file required" 422.
	r.Body = http.MaxBytesReader(w, r.Body, int64(h.svc.AvatarMaxBytes(r.Context())+avatarOverhead))
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			httpx.WriteError(w, apperr.New(http.StatusRequestEntityTooLarge, "payload_too_large"))
			return
		}
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, apperr.Validation(map[string]string{"file": "required"}))
		return
	}
	defer func() { _ = file.Close() }()

	res, err := h.svc.UploadAvatar(r.Context(), id, memberID, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteAvatar handles DELETE /api/members/{id}/avatar.
func (h *Handler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	memberID, ok := pathID(w, r)
	if !ok {
		return
	}
	res, err := h.svc.DeleteAvatar(r.Context(), id, memberID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// ListPublic handles GET /api/public/members — active roster, no auth.
func (h *Handler) ListPublic(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.ListPublic(r.Context(), listParams(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetPublic handles GET /api/public/members/{slug} — active member, no auth.
func (h *Handler) GetPublic(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.GetPublicBySlug(r.Context(), r.URL.Query().Get("locale"), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
