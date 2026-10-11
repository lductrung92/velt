package catalog

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// mediaID parses the {mediaId} path parameter.
func mediaID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "mediaId"))
	if err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return uuid.Nil, false
	}
	return id, true
}

// SetCategories handles PUT /api/products/{id}/categories.
func (h *Handler) SetCategories(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req SetCategoriesRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.SetCategories(r.Context(), id, productID, req.CategoryIDs)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"categories": res})
}

// SetMembers handles PUT /api/products/{id}/members.
func (h *Handler) SetMembers(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req SetMembersRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.SetMembers(r.Context(), id, productID, req.Members)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"members": res})
}

// Gallery handles GET /api/products/{id}/media.
func (h *Handler) Gallery(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Gallery(r.Context(), id, productID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": res})
}

// AddGalleryImage handles POST /api/products/{id}/media (multipart, field
// "file", optional form field "caption").
func (h *Handler) AddGalleryImage(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	// Parse explicitly so a body over the cap surfaces as 413 instead of a
	// misleading "file required" 422.
	r.Body = http.MaxBytesReader(w, r.Body, int64(h.svc.MaxUploadBytes(r.Context())+uploadOverhead))
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

	var caption *string
	if c := r.FormValue("caption"); c != "" {
		caption = &c
	}
	res, err := h.svc.AddGalleryImage(r.Context(), id, productID, caption, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// AddGalleryVideo handles POST /api/products/{id}/media/video.
func (h *Handler) AddGalleryVideo(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req AddVideoRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.AddGalleryVideo(r.Context(), id, productID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateGalleryItem handles PATCH /api/products/{id}/media/{mediaId}.
func (h *Handler) UpdateGalleryItem(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	mid, ok := mediaID(w, r)
	if !ok {
		return
	}
	var req UpdateMediaRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateGalleryCaption(r.Context(), id, productID, mid, req.Caption)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteGalleryItem handles DELETE /api/products/{id}/media/{mediaId}.
func (h *Handler) DeleteGalleryItem(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	mid, ok := mediaID(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteGalleryItem(r.Context(), id, productID, mid); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// ReorderGallery handles PUT /api/products/{id}/media/order.
func (h *Handler) ReorderGallery(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req ReorderMediaRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.ReorderGallery(r.Context(), id, productID, req.IDs)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": res})
}
