package settings

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts the settings endpoints. authMW guards the admin
// endpoints (Bearer); the public read endpoint is unauthenticated. Per-endpoint
// permission (settings.read/manage) is enforced in the service layer.
func RegisterRoutes(r chi.Router, h *Handler, authMW func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/settings", h.GetAll)
		r.Put("/api/settings", h.Update)
		r.Post("/api/settings/email/test", h.TestEmail)
	})
	r.Get("/api/public/settings", h.GetPublic)
}
