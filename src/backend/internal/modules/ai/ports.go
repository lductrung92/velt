package ai

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/ai/tools"
	"github.com/velt/backend/internal/modules/crm/leads"
	"github.com/velt/backend/internal/modules/products/catalog"
)

// catalogPort adapts the products context to the narrow slice the assistant is
// allowed to read.
//
// It goes through the PUBLIC catalog service, not the admin one. That is the
// whole point: the public service can only ever return published snapshots, so
// the assistant physically cannot talk about a draft, and it never sees a
// storage key or an editorial status either.
type catalogPort struct {
	pub *catalog.PublicService
}

func (p catalogPort) SearchPublished(ctx context.Context, query string, limit int) ([]tools.CatalogItem, error) {
	res, err := p.pub.List(ctx, catalog.PublicListParams{
		Query: strings.TrimSpace(query), PageSize: limit, Page: 1,
	})
	if err != nil {
		return nil, err
	}
	out := make([]tools.CatalogItem, 0, len(res.Items))
	for _, it := range res.Items {
		cats := make([]string, 0, len(it.Categories))
		for _, c := range it.Categories {
			cats = append(cats, c.Name)
		}
		out = append(out, tools.CatalogItem{
			Slug: it.Slug, Name: it.Name, Summary: deref(it.Summary),
			Lifecycle: it.Lifecycle, Audience: it.Audience,
			Platforms: it.Platforms, Categories: cats,
		})
	}
	return out, nil
}

func (p catalogPort) GetPublished(ctx context.Context, slug string) (*tools.CatalogDetail, error) {
	// Empty locale, which resolves to Vietnamese: the assistant answers in the
	// language of the site it is embedded in, and that site is Vietnamese.
	d, err := p.pub.GetBySlug(ctx, "", slug)
	if err != nil {
		// "No such published product" is an answer, not a fault: the model
		// should say so rather than retry around an error.
		return nil, nil //nolint:nilerr // see comment
	}
	cats := make([]string, 0, len(d.Categories))
	for _, c := range d.Categories {
		cats = append(cats, c.Name)
	}
	people := make([]tools.Person, 0, len(d.Members))
	for _, m := range d.Members {
		people = append(people, tools.Person{
			Slug: m.Slug, FullName: m.FullName, Role: deref(m.Role),
		})
	}
	return &tools.CatalogDetail{
		CatalogItem: tools.CatalogItem{
			Slug: d.Slug, Name: d.Name, Summary: deref(d.Summary),
			Lifecycle: d.Lifecycle, Audience: d.Audience,
			Platforms: d.Platforms, Categories: cats,
		},
		// Plain text, not the stored HTML: the model does not need markup, and
		// stripping it keeps a prompt-injection string hidden in an attribute
		// from ever reaching the model.
		Description:      stripHTML(deref(d.BodyHTML)),
		TechStack:        d.TechStack,
		Highlights:       d.Highlights,
		Version:          deref(d.Version),
		ReleasedAt:       deref(d.ReleasedAt),
		ProductURL:       deref(d.ProductURL),
		DemoURL:          deref(d.Demo.URL),
		DemoAccess:       deref(d.Demo.Access),
		DemoInstructions: d.Demo.Instructions,
		Members:          people,
	}, nil
}

// rosterPort adapts the members context: the public roster, exactly what the
// site already shows.
type rosterPort struct {
	list func(ctx context.Context) ([]tools.Person, error)
}

func (p rosterPort) ListActive(ctx context.Context) ([]tools.Person, error) {
	return p.list(ctx)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// stripHTML reduces stored rich text to something a model can read. Crude on
// purpose: tags out, entities for the few that matter, whitespace collapsed.
func stripHTML(in string) string {
	if in == "" {
		return ""
	}
	var b strings.Builder
	depth := 0
	for _, r := range in {
		switch {
		case r == '<':
			depth++
		case r == '>':
			if depth > 0 {
				depth--
			}
			if depth == 0 {
				b.WriteRune(' ')
			}
		case depth == 0:
			b.WriteRune(r)
		}
	}
	out := b.String()
	for from, to := range map[string]string{
		"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": `"`, "&#39;": "'",
	} {
		out = strings.ReplaceAll(out, from, to)
	}
	return strings.Join(strings.Fields(out), " ")
}

// leadPort records a lead the assistant collected.
//
// It writes through the CRM service's CaptureFromChat — the one unauthenticated
// entry point, which forces source=chat and status=new so the assistant cannot
// pass a lead off as hand-entered. Everything the model supplies is content;
// everything that decides ownership comes from the session.
type leadPort struct {
	capture func(ctx context.Context, in leads.CreateRequest) (leads.Response, error)
	resolve func(ctx context.Context, slugs []string) ([]uuid.UUID, error)
	hasLead func(ctx context.Context, convID uuid.UUID) (bool, error)
	attach  func(ctx context.Context, convID, leadID uuid.UUID) (bool, error)
	log     *slog.Logger
}

func (p leadPort) Capture(ctx context.Context, in tools.LeadInput) (bool, error) {
	// Check before writing, not after. A model that calls the tool twice in one
	// turn is the ordinary case, and asking afterwards would mean the duplicate
	// row already exists by the time we notice.
	if had, err := p.hasLead(ctx, in.ConversationID); err == nil && had {
		return true, nil
	}

	productIDs, err := p.resolve(ctx, in.ProductSlugs)
	if err != nil {
		// A bad slug must not cost the visitor their contact details.
		p.log.Warn("ai: could not resolve product slugs for a lead", "err", err)
		productIDs = nil
	}

	convID := in.ConversationID
	req := leads.CreateRequest{
		Contact: leads.Contact{
			Name: ptrOrNil(in.Name), Email: ptrOrNil(in.Email),
			Phone: ptrOrNil(in.Phone), Zalo: ptrOrNil(in.Zalo),
		},
		ConversationID:   &convID,
		AssignedMemberID: in.ReferrerMemberID, // the ?ref= member, or the shared queue
		Note:             ptrOrNil(in.Note),
		ProductIDs:       productIDs,
	}
	lead, err := p.capture(ctx, req)
	if err != nil {
		return false, err
	}

	already, err := p.attach(ctx, convID, lead.ID)
	if err != nil {
		return false, err
	}
	if already {
		// Two answers for one conversation raced past the check above. Rare,
		// and the row stands: a duplicate contact request is a smaller problem
		// than giving the assistant a way to delete leads.
		p.log.Warn("ai: duplicate lead for one conversation", "conversation_id", convID)
	}
	return already, nil
}

func ptrOrNil(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}
