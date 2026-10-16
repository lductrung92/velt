package leads

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/recaptcha"
)

// The site's contact form is the second unauthenticated way a lead can be
// created, after the assistant. It is held to the same shape as the chat
// surface: a per-IP ceiling in the handler, and nothing the caller sends
// decides anything but their own contact details.
const (
	rlFormPerIP  = 5
	rlFormWindow = 10 * time.Minute
)

// FormRequest is the public contact form's body.
//
// Deliberately narrower than CreateRequest: a visitor may say who they are,
// which product they mean and what they want, and nothing else. Status,
// source, assignee and conversation id are the server's to decide — accepting
// them here would let anyone file a lead as already-won, or assign it to a
// member of their choosing.
type FormRequest struct {
	Name      string     `json:"name" validate:"required,max=160"`
	Email     string     `json:"email" validate:"required,email,max=255"`
	Message   string     `json:"message" validate:"required,max=2000"`
	ProductID *uuid.UUID `json:"product_id"`
	// Ref is the ?ref= member slug the visitor arrived with, if any. A slug,
	// not an id: it is the same token the referral links already carry, and an
	// unknown one is ignored rather than refused.
	Ref string `json:"ref" validate:"omitempty,max=160"`
	// Token is the reCAPTCHA response. Required only when protection is on.
	Token string `json:"recaptcha_token" validate:"omitempty,max=4000"`
}

// MemberResolver turns a ?ref= slug into the member it names.
type MemberResolver func(ctx context.Context, slug string) (*uuid.UUID, error)

// PublicHandler serves the site's contact form.
type PublicHandler struct {
	svc        *Service
	verifier   *recaptcha.Verifier
	limiter    ratelimit.Limiter
	trustProxy bool
	resolveRef MemberResolver
}

// NewPublicHandler wires the form endpoint. resolveRef may be nil, in which
// case a referral slug is simply not credited.
func NewPublicHandler(svc *Service, v *recaptcha.Verifier, limiter ratelimit.Limiter,
	trustProxy bool, resolveRef MemberResolver,
) *PublicHandler {
	return &PublicHandler{svc: svc, verifier: v, limiter: limiter,
		trustProxy: trustProxy, resolveRef: resolveRef}
}

// Submit handles POST /api/public/leads.
func (h *PublicHandler) Submit(w http.ResponseWriter, r *http.Request) {
	ip := httpx.ClientIP(r, h.trustProxy)

	// The ceiling comes first: it is the guard that still holds when reCAPTCHA
	// is switched off, which is how the endpoint ships by default.
	if h.limiter != nil {
		ok, retryAfter, err := h.limiter.Allow(r.Context(), "leads:form:ip:"+ip,
			rlFormPerIP, rlFormWindow)
		if err != nil || !ok {
			httpx.WriteError(w, apperr.RateLimited(retryAfter))
			return
		}
	}

	var req FormRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}

	if h.verifier != nil {
		switch err := h.verifier.Check(r.Context(), req.Token, ip); {
		case errors.Is(err, recaptcha.ErrFailed):
			httpx.WriteError(w, apperr.Validation(
				map[string]string{"recaptcha_token": "invalid"}))
			return
		case err != nil:
			// Misconfigured, or Google unreachable. Neither is the visitor's
			// fault and neither is a pass: log it and answer 503 so somebody
			// notices, rather than quietly accepting unverified submissions.
			h.svc.Sec(r.Context()).Error("leads: recaptcha", "err", err)
			httpx.WriteError(w, apperr.BadGateway("recaptcha_unavailable",
				"verification service did not answer"))
			return
		}
	}

	var assignee *uuid.UUID
	if req.Ref != "" && h.resolveRef != nil {
		// A dead referral link is the sharer's problem, not the visitor's —
		// the same rule the chat applies when it resolves ?ref=.
		if id, err := h.resolveRef(r.Context(), req.Ref); err == nil {
			assignee = id
		}
	}

	var products []uuid.UUID
	if req.ProductID != nil {
		products = []uuid.UUID{*req.ProductID}
	}

	if err := h.svc.CaptureFromForm(r.Context(), FormCapture{
		Name:             req.Name,
		Email:            req.Email,
		Note:             req.Message,
		AssignedMemberID: assignee,
		ProductIDs:       products,
	}); err != nil {
		httpx.WriteError(w, err)
		return
	}
	// No body: the lead belongs to the console now, and echoing it back would
	// tell an anonymous caller what was stored about them.
	w.WriteHeader(http.StatusNoContent)
}

// RegisterPublic mounts the contact form. No auth by design — see
// CaptureFromForm for what that costs and what holds it in check.
func RegisterPublic(r chi.Router, h *PublicHandler) {
	r.Post("/api/public/leads", h.Submit)
}
