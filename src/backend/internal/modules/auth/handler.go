package auth

import (
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the HTTP layer for auth. It only parses/writes HTTP and delegates
// all logic to the Service.
type Handler struct {
	svc               *Service
	cookieSecure      bool
	cookieDomain      string
	trustProxyHeaders bool
}

// NewHandler builds the auth HTTP handler. trustProxyHeaders must be true only
// when running behind a trusted reverse proxy (see config.TrustProxyHeaders).
func NewHandler(svc *Service, cookieSecure bool, cookieDomain string, trustProxyHeaders bool) *Handler {
	return &Handler{
		svc:               svc,
		cookieSecure:      cookieSecure,
		cookieDomain:      cookieDomain,
		trustProxyHeaders: trustProxyHeaders,
	}
}

type loginResponse struct {
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	ExpiresIn   int          `json:"expires_in"`
	User        UserResponse `json:"user"`
}

type challengeResponse struct {
	TwoFactorRequired bool   `json:"two_factor_required"`
	ChallengeToken    string `json:"challenge_token"`
}

type okResponse struct {
	OK bool `json:"ok"`
}

// Login handles POST /api/auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Login(r.Context(), req, h.requestMeta(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.writeLoginResult(w, res)
}

// VerifyTwoFactor handles POST /api/auth/2fa/verify.
func (h *Handler) VerifyTwoFactor(w http.ResponseWriter, r *http.Request) {
	var req TwoFactorVerifyRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.VerifyTwoFactor(r.Context(), req, h.requestMeta(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.writeLoginResult(w, res)
}

// Refresh handles POST /api/auth/refresh.
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.Refresh(r.Context(), httpx.ReadRefreshCookie(r), h.requestMeta(r))
	if err != nil {
		httpx.ClearRefreshCookie(w, h.cookieSecure, h.cookieDomain)
		httpx.WriteError(w, err)
		return
	}
	httpx.SetRefreshCookie(w, res.RefreshToken, res.RefreshExpiresAt, h.cookieSecure, h.cookieDomain)
	httpx.WriteJSON(w, http.StatusOK, loginResponse{
		AccessToken: res.AccessToken,
		TokenType:   "Bearer",
		ExpiresIn:   res.ExpiresIn,
		User:        res.User,
	})
}

// Logout handles POST /api/auth/logout (revoke current session via cookie).
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Logout(r.Context(), httpx.ReadRefreshCookie(r)); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.ClearRefreshCookie(w, h.cookieSecure, h.cookieDomain)
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// LogoutAll handles POST /api/auth/logout-all (Bearer required).
func (h *Handler) LogoutAll(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	if err := h.svc.LogoutAll(r.Context(), id.UserID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.ClearRefreshCookie(w, h.cookieSecure, h.cookieDomain)
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// Me handles GET /api/auth/me (Bearer required).
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	res, err := h.svc.Me(r.Context(), id.UserID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// ForgotPassword handles POST /api/auth/forgot-password (always 200 unless rate-limited).
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.ForgotPassword(r.Context(), req, h.requestMeta(r)); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, okResponse{OK: true})
}

// ResetPassword handles POST /api/auth/reset-password.
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.ResetPassword(r.Context(), req, h.requestMeta(r)); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, okResponse{OK: true})
}

func (h *Handler) writeLoginResult(w http.ResponseWriter, res LoginResult) {
	if res.TwoFactorRequired {
		httpx.WriteJSON(w, http.StatusOK, challengeResponse{
			TwoFactorRequired: true,
			ChallengeToken:    res.ChallengeToken,
		})
		return
	}
	httpx.SetRefreshCookie(w, res.RefreshToken, res.RefreshExpiresAt, h.cookieSecure, h.cookieDomain)
	httpx.WriteJSON(w, http.StatusOK, loginResponse{
		AccessToken: res.AccessToken,
		TokenType:   "Bearer",
		ExpiresIn:   res.ExpiresIn,
		User:        res.User,
	})
}

// requestMeta extracts non-secret client context for session bookkeeping.
func (h *Handler) requestMeta(r *http.Request) RequestMeta {
	return RequestMeta{IP: httpx.ClientIP(r, h.trustProxyHeaders), UserAgent: r.UserAgent()}
}
