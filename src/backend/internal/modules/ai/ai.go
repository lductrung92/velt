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
	"github.com/velt/backend/internal/modules/ai/endpoints"
	"github.com/velt/backend/internal/modules/ai/mcp"
	"github.com/velt/backend/internal/modules/ai/shared"
	"github.com/velt/backend/internal/modules/ai/tools"
	"github.com/velt/backend/internal/modules/crm/leads"
	"github.com/velt/backend/internal/modules/notify"
	"github.com/velt/backend/internal/modules/products/catalog"
	settingssvc "github.com/velt/backend/internal/modules/settings"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/recaptcha"
)

// SettingDefs are the assistant's entries in the settings registry, exported
// for main.go to append the way it does for cms.
func SettingDefs() []settingssvc.SettingDef {
	return append(shared.SettingDefs(), notify.SettingDefs()...)
}

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
	// NotifySubject is the contact a push service may use to reach us about a
	// misbehaving sender — a "mailto:" or URL. VAPID requires one.
	NotifySubject string
}

// Register builds the assistant and mounts the visitor-facing chat.
//
// `secureCookies` marks the visitor cookie HTTPS-only; it follows the same
// deployment flag the rest of the app uses. `limiter`/`trustProxy` feed the
// per-IP guard on the public chat — the only unauthenticated surface here that
// spends money, so it must never be mounted without one.
// It returns the notification service because other bounded contexts ring it
// too — a lead and a newsletter sign-up are worth knowing about, and there is
// one duty roster, one set of registered browsers and one VAPID key pair. It
// is built here because this is where the chat already needed it.
func Register(r chi.Router, pool *pgxpool.Pool, settings conversation.SettingsPort,
	logger *slog.Logger, authMW func(http.Handler) http.Handler, deps Deps, secureCookies bool,
	limiter ratelimit.Limiter, trustProxy bool, aead *crypto.AEAD,
) *notify.Service {
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

	// The endpoints and the chain each job runs through. One service: the
	// console edits it and the conversation reads it.
	eps := endpoints.NewService(endpoints.NewRepository(pool), aead)
	eps.SetPasswords(passwordPort{pool: pool})
	// Its own store over the same pool and logger. activity.Store holds no
	// state beyond those two, so a second one writes the same rows; passing
	// the shared instance would mean threading it through Register's already
	// long signature for one call site.
	eps.SetActivity(activity.New(pool, logger))

	// Desktop notifications for the duty roster. The conversation only ever
	// asks it to ring; when to stay quiet is the notify service's own rule.
	notifySvc := notify.NewService(notify.NewRepository(pool), aead, logger, deps.NotifySubject)
	notifySvc.SetSettings(settings)

	svc := conversation.NewService(base, repo,
		conversation.NewHub(), conversation.NewPresence(), reg, cat, settings, eps,
		notifySvc)

	// Agent-facing reads. Registered on the SAME registry: one implementation,
	// two edges, with visibility decided per edge. See docs/diagrams/ai-mcp.svg.
	tools.RegisterTeam(reg,
		pipelinePort{list: deps.Leads.List},
		transcriptPort{read: svc.StaffTranscript},
	)

	conversation.RegisterPublic(r, conversation.NewHandler(svc, secureCookies, limiter, trustProxy,
		recaptcha.NewVerifier(settings)))
	staffH := conversation.NewStaffHandler(svc)
	conversation.RegisterStaff(r, staffH, authMW)
	conversation.RegisterAdmin(r, staffH, authMW)

	endpoints.Register(r, endpoints.NewHandler(eps, base, limiter), authMW)

	r.Route("/api/notify", func(nr chi.Router) {
		nr.Use(authMW)
		notify.NewHandler(notifySvc, logger).Routes(nr)
	})

	tokens := mcp.NewTokenStore(pool)
	ident := identityPort{pool: pool}
	mcp.Register(r, mcp.NewHandler(mcp.NewServer(reg, tokens, ident), tokens, ident), authMW)

	return notifySvc
}
