package members

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/platform/storage"
)

// Register builds the members service/handler and mounts both surfaces: the
// authenticated console routes (per-endpoint permission enforced in the service)
// and the unauthenticated public roster.
//
// `/api/members/order` is declared before `/api/members/{id}` because chi matches
// a literal segment ahead of a wildcard only within the same routing tree — the
// explicit ordering keeps the intent obvious to the next reader.
func Register(r chi.Router, pool *pgxpool.Pool, store *storage.Manager, settings SettingsPort,
	logger *slog.Logger, authMW func(http.Handler) http.Handler,
) {
	h := NewHandler(NewService(NewRepository(pool), store, store, settings, Options{Logger: logger}))

	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/members", h.List)
		r.Post("/api/members", h.Create)
		r.Put("/api/members/order", h.Reorder)
		r.Get("/api/members/{id}", h.Get)
		r.Patch("/api/members/{id}", h.Update)
		r.Delete("/api/members/{id}", h.Delete)
		r.Post("/api/members/{id}/avatar", h.UploadAvatar)
		r.Delete("/api/members/{id}/avatar", h.DeleteAvatar)
	})

	r.Get("/api/public/members", h.ListPublic)
	r.Get("/api/public/members/{slug}", h.GetPublic)
}
