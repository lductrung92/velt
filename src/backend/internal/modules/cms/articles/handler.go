package articles

import (
	"errors"
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// uploadMultipartOverhead is the slack above the configured image cap to cover
// multipart framing (boundaries/headers) when bounding the request body.
const uploadMultipartOverhead = 1 << 20

// Handler is the HTTP layer for articles.
type Handler struct {
	svc *Service
}

// NewHandler builds the articles HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetArticles handles GET /api/cms/articles (paginated; editor ABAC).
func (h *Handler) GetArticles(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	p := ArticleListParams{
		Query:      r.URL.Query().Get("q"),
		Status:     r.URL.Query().Get("status"),
		Tag:        r.URL.Query().Get("tag"),
		Sort:       r.URL.Query().Get("sort"),
		CategoryID: shared.QueryUUID(r, "category_id"),
		AuthorID:   shared.QueryUUID(r, "author_id"),
		Page:       shared.QueryInt(r, "page", 1),
		PageSize:   shared.QueryInt(r, "page_size", 20),
	}
	res, err := h.svc.ListArticles(r.Context(), id, p)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetArticle handles GET /api/cms/articles/{id}.
func (h *Handler) GetArticle(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	aid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.GetArticle(r.Context(), id, aid)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreateArticle handles POST /api/cms/articles.
func (h *Handler) CreateArticle(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreateArticleRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateArticle(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateArticle handles PATCH /api/cms/articles/{id} (optimistic-locked).
func (h *Handler) UpdateArticle(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	aid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateArticleRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateArticle(r.Context(), id, aid, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteArticle handles DELETE /api/cms/articles/{id}.
func (h *Handler) DeleteArticle(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	aid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteArticle(r.Context(), id, aid); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// UploadArticleMedia handles POST /api/cms/articles/{id}/upload (multipart: field
// "file" + "purpose" ∈ featured|og|inline).
func (h *Handler) UploadArticleMedia(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	aid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, int64(h.svc.MaxUploadBytes(r.Context())+uploadMultipartOverhead))
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			httpx.WriteError(w, apperr.New(http.StatusRequestEntityTooLarge, "payload_too_large"))
			return
		}
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	purpose := r.FormValue("purpose")
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, apperr.Validation(map[string]string{"file": "required"}))
		return
	}
	defer func() { _ = file.Close() }()

	res, err := h.svc.UploadArticleMedia(r.Context(), id, aid, purpose, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
