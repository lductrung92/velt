package widgets

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// permPageView gates the editor preview: anyone who may view pages may preview a
// widget's resolved data (same vocabulary as pages.permView).
const permPageView = "cms.page.view"

// PreviewService resolves an UNSAVED widget config to live data for the page
// editor's "preview" tab. It reuses the exact same Resolver the public page uses,
// so what the editor previews matches what visitors will see.
type PreviewService struct {
	*shared.Base
	resolver *Resolver
}

// NewPreviewService wires the preview service onto the shared CMS base.
func NewPreviewService(base *shared.Base, resolver *Resolver) *PreviewService {
	return &PreviewService{Base: base, resolver: resolver}
}

// PreviewResponse is {type, data} where data mirrors the public widget payload
// (e.g. {"items":[…]}) or null for static widgets (rich_text/cta_banner).
type PreviewResponse struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Preview validates the config (rejecting unknown types / dangerous schemes) then
// resolves it with the live data ports. Requires cms.page.view.
func (s *PreviewService) Preview(ctx context.Context, id *httpx.Identity, typ string, config json.RawMessage) (PreviewResponse, error) {
	if err := s.Require(ctx, id, permPageView); err != nil {
		return PreviewResponse{}, err
	}
	clean, err := SanitizeConfig(typ, config)
	if err != nil {
		return PreviewResponse{}, err
	}
	data, err := s.resolver.Resolve(ctx, typ, clean)
	if err != nil {
		return PreviewResponse{}, apperr.Internal()
	}
	return PreviewResponse{Type: typ, Data: data}, nil
}

// PreviewHandler is the HTTP layer for widget preview.
type PreviewHandler struct{ svc *PreviewService }

type previewRequest struct {
	Type   string          `json:"type" validate:"required"`
	Config json.RawMessage `json:"config"`
}

// RegisterPreview mounts POST /widgets/preview on the authed CMS group.
func RegisterPreview(r chi.Router, base *shared.Base, resolver *Resolver) {
	h := &PreviewHandler{svc: NewPreviewService(base, resolver)}
	r.Post("/widgets/preview", h.preview)
}

func (h *PreviewHandler) preview(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req previewRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Preview(r.Context(), id, req.Type, req.Config)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
