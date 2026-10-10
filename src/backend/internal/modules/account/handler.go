package account

import (
	"errors"
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// avatarOverhead is slack added over the configured max to allow for multipart
// boundary/header bytes, so a legitimate at-the-limit upload isn't rejected by
// the transport cap before the service can validate the exact size.
const avatarOverhead = 1 << 20 // 1 MiB

// Handler is the HTTP layer for account self-service.
type Handler struct {
	svc               *Service
	cookieSecure      bool
	cookieDomain      string
	trustProxyHeaders bool
}

// NewHandler builds the account HTTP handler.
func NewHandler(svc *Service, cookieSecure bool, cookieDomain string, trustProxyHeaders bool) *Handler {
	return &Handler{svc: svc, cookieSecure: cookieSecure, cookieDomain: cookieDomain, trustProxyHeaders: trustProxyHeaders}
}

func (h *Handler) identity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

// GetProfile handles GET /api/account/profile.
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.GetProfile(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// UpdateProfile handles PATCH /api/account/profile.
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	var req UpdateProfileRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	user, err := h.svc.UpdateProfile(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
}

// ChangePassword handles POST /api/account/change-password.
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	var req ChangePasswordRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.ChangePassword(r.Context(), id, req, h.requestMeta(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.SetRefreshCookie(w, res.RefreshToken, res.RefreshExpiresAt, h.cookieSecure, h.cookieDomain)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"access_token": res.AccessToken,
		"token_type":   "Bearer",
		"expires_in":   res.ExpiresIn,
	})
}

// UploadAvatar handles POST /api/account/avatar (multipart, field "file").
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
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

	url, err := h.svc.UploadAvatar(r.Context(), id, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"avatar_url": url})
}

// DeleteAvatar handles DELETE /api/account/avatar.
func (h *Handler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteAvatar(r.Context(), id); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// SetupTwoFactor handles POST /api/account/2fa/setup.
func (h *Handler) SetupTwoFactor(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.SetupTwoFactor(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// EnableTwoFactor handles POST /api/account/2fa/enable.
func (h *Handler) EnableTwoFactor(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	var req Enable2FARequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	codes, err := h.svc.EnableTwoFactor(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"recovery_codes": codes})
}

// DisableTwoFactor handles POST /api/account/2fa/disable.
func (h *Handler) DisableTwoFactor(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	var req Password2FARequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.DisableTwoFactor(r.Context(), id, req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// RegenerateRecoveryCodes handles POST /api/account/2fa/recovery-codes.
func (h *Handler) RegenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	id, ok := h.identity(w, r)
	if !ok {
		return
	}
	var req Password2FARequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	codes, err := h.svc.RegenerateRecoveryCodes(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"recovery_codes": codes})
}

func (h *Handler) requestMeta(r *http.Request) RequestMeta {
	return RequestMeta{IP: httpx.ClientIP(r, h.trustProxyHeaders), UserAgent: r.UserAgent()}
}
