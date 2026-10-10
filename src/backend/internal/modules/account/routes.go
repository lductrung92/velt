package account

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts the account endpoints under /api/account. All require a
// valid Bearer token (authMW); ownership is always the authenticated caller.
func RegisterRoutes(r chi.Router, h *Handler, authMW func(http.Handler) http.Handler) {
	r.Route("/api/account", func(r chi.Router) {
		r.Use(authMW)
		r.Get("/profile", h.GetProfile)
		r.Patch("/profile", h.UpdateProfile)
		r.Post("/avatar", h.UploadAvatar)
		r.Delete("/avatar", h.DeleteAvatar)
		r.Post("/change-password", h.ChangePassword)
		r.Post("/2fa/setup", h.SetupTwoFactor)
		r.Post("/2fa/enable", h.EnableTwoFactor)
		r.Post("/2fa/disable", h.DisableTwoFactor)
		r.Post("/2fa/recovery-codes", h.RegenerateRecoveryCodes)
	})
}
