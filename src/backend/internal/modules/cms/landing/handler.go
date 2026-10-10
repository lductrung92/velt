package landing

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// uploadMultipartOverhead is slack for the multipart envelope on top of the file cap.
const uploadMultipartOverhead = 1 << 20

// Handler is the HTTP layer for the landing builder.
type Handler struct {
	svc *Service
}

// NewHandler builds the landing HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetLandings handles GET /api/cms/landing (list).
func (h *Handler) GetLandings(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.ListLandings(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetLanding handles GET /api/cms/landing/{id} (builder data).
func (h *Handler) GetLanding(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.GetLanding(r.Context(), id, lid)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreateLanding handles POST /api/cms/landing.
func (h *Handler) CreateLanding(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreateLandingRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateLanding(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateLanding handles PATCH /api/cms/landing/{id}.
func (h *Handler) UpdateLanding(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateLandingRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateLanding(r.Context(), id, lid, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteLanding handles DELETE /api/cms/landing/{id}.
func (h *Handler) DeleteLanding(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteLanding(r.Context(), id, lid); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// CreateSection handles POST /api/cms/landing/{id}/sections.
func (h *Handler) CreateSection(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req CreateSectionRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateSection(r.Context(), id, lid, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateSection handles PATCH /api/cms/landing/sections/{id}.
func (h *Handler) UpdateSection(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	sid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateSectionRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateSection(r.Context(), id, sid, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteSection handles DELETE /api/cms/landing/sections/{id}.
func (h *Handler) DeleteSection(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	sid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteSection(r.Context(), id, sid); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// ReorderSections handles PUT /api/cms/landing/{id}/sections/order.
func (h *Handler) ReorderSections(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req ReorderSectionsRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.ReorderSections(r.Context(), id, lid, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// UploadMedia handles POST /api/cms/landing/{id}/upload (multipart: field "file").
func (h *Handler) UploadMedia(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
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
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, apperr.Validation(map[string]string{"file": "required"}))
		return
	}
	defer func() { _ = file.Close() }()

	res, err := h.svc.UploadMedia(r.Context(), id, lid, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// PublishLanding handles POST /api/cms/landing/{id}/publish.
func (h *Handler) PublishLanding(w http.ResponseWriter, r *http.Request) {
	h.statusAction(w, r, h.svc.PublishLanding)
}

// UnpublishLanding handles POST /api/cms/landing/{id}/unpublish.
func (h *Handler) UnpublishLanding(w http.ResponseWriter, r *http.Request) {
	h.statusAction(w, r, h.svc.UnpublishLanding)
}

func (h *Handler) statusAction(w http.ResponseWriter, r *http.Request,
	action func(context.Context, *httpx.Identity, uuid.UUID) (DetailResponse, error)) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	lid, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := action(r.Context(), id, lid)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
