package auth

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts the auth endpoints under /api/auth. authMW is the
// Bearer authentication middleware, applied only to the endpoints that require
// an authenticated caller (/me, /logout-all).
func RegisterRoutes(r chi.Router, h *Handler, authMW func(http.Handler) http.Handler) {
	r.Route("/api/auth", func(r chi.Router) {
		// Public (no Bearer; refresh/logout use the httpOnly cookie).
		r.Post("/login", h.Login)
		r.Post("/2fa/verify", h.VerifyTwoFactor)
		r.Post("/refresh", h.Refresh)
		r.Post("/logout", h.Logout)
		r.Post("/forgot-password", h.ForgotPassword)
		r.Post("/reset-password", h.ResetPassword)

		// Authenticated.
		r.Group(func(r chi.Router) {
			r.Use(authMW)
			r.Get("/me", h.Me)
			r.Post("/logout-all", h.LogoutAll)
		})
	})
}
