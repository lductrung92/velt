package taxonomy

import (
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Handler is the HTTP layer for taxonomy (categories + tags).
type Handler struct {
	svc *Service
}

// NewHandler builds the taxonomy HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// --- Categories ---

// ListCategories handles GET /api/cms/categories.
func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.ListCategories(r.Context(), id, httpx.Locale(r), r.URL.Query().Get("status"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreateCategory handles POST /api/cms/categories.
func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreateCategoryRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateCategory(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateCategory handles PATCH /api/cms/categories/{id}.
func (h *Handler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	catID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateCategoryRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateCategory(r.Context(), id, catID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteCategory handles DELETE /api/cms/categories/{id}.
func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	catID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteCategory(r.Context(), id, catID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// --- Tags ---

// ListTags handles GET /api/cms/tags (paginated; q filters name/slug).
func (h *Handler) ListTags(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	p := TagListParams{
		Query:    r.URL.Query().Get("q"),
		Page:     shared.QueryInt(r, "page", 1),
		PageSize: shared.QueryInt(r, "page_size", 20),
		Sort:     r.URL.Query().Get("sort"),
	}
	res, err := h.svc.ListTags(r.Context(), id, p)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// ListTagOptions handles GET /api/cms/tags/options (full flat list for selectors).
func (h *Handler) ListTagOptions(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.ListTagOptions(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreateTag handles POST /api/cms/tags.
func (h *Handler) CreateTag(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreateTagRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateTag(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateTag handles PATCH /api/cms/tags/{id}.
func (h *Handler) UpdateTag(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	tagID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateTagRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateTag(r.Context(), id, tagID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteTag handles DELETE /api/cms/tags/{id}.
func (h *Handler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	tagID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteTag(r.Context(), id, tagID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// MergeTags handles POST /api/cms/tags/merge.
func (h *Handler) MergeTags(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req MergeTagsRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.MergeTags(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
