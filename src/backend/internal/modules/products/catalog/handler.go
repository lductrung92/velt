package catalog

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

// uploadOverhead is slack added over the configured max to allow for multipart
// framing (boundaries, headers) so a file exactly at the cap is not rejected by
// the body reader before the service can check it.
const uploadOverhead = 1 << 20 // 1 MiB

// Handler is the HTTP layer for the product catalog. It decodes/validates,
// delegates to the service, and writes the response — no business rules here.
type Handler struct {
	svc *Service
}

// NewHandler builds the catalog HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func identity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return uuid.Nil, false
	}
	return id, true
}

func listParams(r *http.Request) (ListParams, error) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("page_size"))
	var featured *bool
	if v := q.Get("featured"); v == "true" || v == "false" {
		b := v == "true"
		featured = &b
	}
	createdFrom, createdTo, err := httpx.QueryDateRange(r, "created_from", "created_to")
	if err != nil {
		return ListParams{}, err
	}
	return ListParams{
		Query:       strings.TrimSpace(q.Get("q")),
		Status:      q.Get("status"),
		Lifecycle:   q.Get("lifecycle"),
		Platform:    q.Get("platform"),
		Audience:    q.Get("audience"),
		Featured:    featured,
		CreatedFrom: createdFrom,
		CreatedTo:   createdTo,
		Sort:        q.Get("sort"),
		Page:        page,
		PageSize:    size,
	}, nil
}

// List handles GET /api/products.
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

// Get handles GET /api/products/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Get(r.Context(), id, productID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Create handles POST /api/products.
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

// Update handles PATCH /api/products/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Update(r.Context(), id, productID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Delete handles DELETE /api/products/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), id, productID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// transition builds the handler for one publication transition.
func (h *Handler) transition(fn func(*http.Request, *httpx.Identity, uuid.UUID) (Response, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := identity(w, r)
		if !ok {
			return
		}
		productID, ok := pathID(w, r)
		if !ok {
			return
		}
		res, err := fn(r, id, productID)
		if err != nil {
			httpx.WriteError(w, err)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, res)
	}
}

// UploadMedia handles POST /api/products/{id}/upload (multipart, field "file",
// query `purpose` = cover|og|inline).
func (h *Handler) UploadMedia(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	productID, ok := pathID(w, r)
	if !ok {
		return
	}
	// Parse explicitly rather than letting FormFile do it, so a body over the cap
	// surfaces as 413 instead of a misleading "file required" 422.
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

	purpose := r.URL.Query().Get("purpose")
	if purpose == "" {
		purpose = "cover"
	}
	res, err := h.svc.UploadMedia(r.Context(), id, productID, purpose, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Register mounts the catalog routes behind auth. Per-endpoint permission is
// enforced in the service layer.
func Register(r chi.Router, svc *Service, authMW func(http.Handler) http.Handler) {
	h := NewHandler(svc)
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/products", h.List)
		r.Post("/api/products", h.Create)
		r.Get("/api/products/{id}", h.Get)
		r.Patch("/api/products/{id}", h.Update)
		r.Delete("/api/products/{id}", h.Delete)
		r.Post("/api/products/{id}/upload", h.UploadMedia)
		r.Put("/api/products/{id}/categories", h.SetCategories)
		r.Put("/api/products/{id}/members", h.SetMembers)
		// /media/order and /media/video are literal segments; they are declared
		// before /media/{mediaId} so the specific match is obvious to the reader.
		r.Get("/api/products/{id}/media", h.Gallery)
		r.Post("/api/products/{id}/media", h.AddGalleryImage)
		r.Post("/api/products/{id}/media/video", h.AddGalleryVideo)
		r.Put("/api/products/{id}/media/order", h.ReorderGallery)
		r.Patch("/api/products/{id}/media/{mediaId}", h.UpdateGalleryItem)
		r.Delete("/api/products/{id}/media/{mediaId}", h.DeleteGalleryItem)
		r.Post("/api/products/{id}/publish", h.transition(
			func(r *http.Request, id *httpx.Identity, pid uuid.UUID) (Response, error) {
				return h.svc.Publish(r.Context(), id, pid)
			}))
		r.Post("/api/products/{id}/unpublish", h.transition(
			func(r *http.Request, id *httpx.Identity, pid uuid.UUID) (Response, error) {
				return h.svc.Unpublish(r.Context(), id, pid)
			}))
		r.Post("/api/products/{id}/archive", h.transition(
			func(r *http.Request, id *httpx.Identity, pid uuid.UUID) (Response, error) {
				return h.svc.Archive(r.Context(), id, pid)
			}))
	})
}
