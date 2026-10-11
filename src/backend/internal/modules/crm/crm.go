// Package crm is the CRM bounded context. Today it holds leads only — see
// docs/domains/crm/README.md for why it exists as its own context before there
// is a CRM to speak of. This file performs wiring only.
package crm

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/crm/leads"
	"github.com/velt/backend/internal/modules/crm/shared"
)

// Register builds the CRM features, mounts their routes, and returns the leads
// service so in-process callers (the AI assistant capturing a lead) can reach it
// without going back out over HTTP.
func Register(r chi.Router, pool *pgxpool.Pool, logger *slog.Logger,
	authMW func(http.Handler) http.Handler,
) *leads.Service {
	svc := leads.NewService(shared.NewBase(logger), leads.NewRepository(pool))
	leads.Register(r, svc, authMW)
	return svc
}
