// Package ai is the AI assistant bounded context. It owns the conversation,
// the tool layer and the LLM client; it reads products and members through
// narrow ports and never the other way round.
//
// See docs/domains/ai/README.md and docs/diagrams/ai-workflow.svg.
package ai

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/ai/conversation"
	"github.com/velt/backend/internal/modules/ai/mcp"
	"github.com/velt/backend/internal/modules/ai/shared"
	"github.com/velt/backend/internal/modules/ai/tools"
	"github.com/velt/backend/internal/modules/crm/leads"
	"github.com/velt/backend/internal/modules/products/catalog"
	settingssvc "github.com/velt/backend/internal/modules/settings"
	"github.com/velt/backend/internal/platform/ratelimit"
)

// SettingDefs are the assistant's entries in the settings registry, exported
// for main.go to append the way it does for cms.
func SettingDefs() []settingssvc.SettingDef { return shared.SettingDefs() }

// Deps are the other contexts the assistant reads from. Both are narrow by
// design: the assistant gets published catalog data and the public roster,
// nothing else.
type Deps struct {
	// Catalog is the products context's PUBLIC service — the one that can only
	// return published snapshots.
	Catalog *catalog.PublicService
	// Roster lists active members, in the shape the tool layer wants.
	Roster func(ctx context.Context) ([]tools.Person, error)
	// Leads is the CRM service. The assistant reaches it through
	// CaptureFromChat only, which forces source=chat and status=new.
	Leads *leads.Service
}

// Register builds the assistant and mounts the visitor-facing chat.
//
// `secureCookies` marks the visitor cookie HTTPS-only; it follows the same
// deployment flag the rest of the app uses. `limiter`/`trustProxy` feed the
// per-IP guard on the public chat — the only unauthenticated surface here that
// spends money, so it must never be mounted without one.
func Register(r chi.Router, pool *pgxpool.Pool, settings conversation.SettingsPort,
	logger *slog.Logger, authMW func(http.Handler) http.Handler, deps Deps, secureCookies bool,
	limiter ratelimit.Limiter, trustProxy bool,
) {
	base := shared.NewBase(logger)

	cat := catalogPort{pub: deps.Catalog}
	repo := conversation.NewRepository(pool)

	reg := tools.NewRegistry()
	tools.RegisterCatalog(reg, cat, rosterPort{list: deps.Roster})
	tools.RegisterLead(reg, leadPort{
		capture: deps.Leads.CaptureFromChat,
		resolve: deps.Catalog.ResolvePublishedSlugs,
		hasLead: func(ctx context.Context, convID uuid.UUID) (bool, error) {
			c, err := repo.Get(ctx, convID)
			if err != nil {
				return false, err
			}
			return c.LeadID != nil, nil
		},
		attach: repo.AttachLead,
		log:    logger,
	})

	svc := conversation.NewService(base, repo,
		conversation.NewHub(), conversation.NewPresence(), reg, cat, settings)

	// Agent-facing reads. Registered on the SAME registry: one implementation,
	// two edges, with visibility decided per edge. See docs/diagrams/ai-mcp.svg.
	tools.RegisterTeam(reg,
		pipelinePort{list: deps.Leads.List},
		transcriptPort{read: svc.StaffTranscript},
	)

	conversation.RegisterPublic(r, conversation.NewHandler(svc, secureCookies, limiter, trustProxy))
	staffH := conversation.NewStaffHandler(svc)
	conversation.RegisterStaff(r, staffH, authMW)
	conversation.RegisterAdmin(r, staffH, authMW)

	tokens := mcp.NewTokenStore(pool)
	ident := identityPort{pool: pool}
	mcp.Register(r, mcp.NewHandler(mcp.NewServer(reg, tokens, ident), tokens, ident), authMW)
}
