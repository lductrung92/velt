package pages

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// EntityPage is this module's key in the shared public read model and in the
// translation store.
const EntityPage = "page"

// baseLocale is the source language: it lives in the page's own columns and is
// never a row in the translation store.
const baseLocale = "vi"

// A page's published URL is its own slug and nothing else. The tree is editorial
// structure — it orders the admin's page list and nothing more — so a child of
// `/gioi-thieu` publishes at `/doi-ngu`, never at `/gioi-thieu/doi-ngu`.
//
// The alternative, a materialised path, was rejected: the public route is a
// single slug segment, and renaming a parent would have to republish every
// descendant, which no single-record publish path can do.
//
// Flat is also what fixes the bug this module shipped with. cms_pages enforces
// UNIQUE (parent_id, slug) — unique among siblings, not unique as a URL — while
// the public lookup was flat and served whichever row sorted first. Two pages
// could publish under one slug and the loser was unreachable for good, with no
// error anywhere. The primary key of published_docs IS the URL, so the second
// page now cannot publish at all: it gets a 409 naming the slug.

// Translator is the slice of the translation module this module needs. It is an
// interface declared here, satisfied at wiring time, and allowed to be nil —
// nil means "no translations", which is also what the feature switched off looks
// like. Tests of this package therefore never have to build a translation module.
type Translator interface {
	// Locales returns the languages to publish besides Vietnamese, nil when the
	// feature is off.
	Locales(ctx context.Context) []string
	Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error)
	Purge(ctx context.Context, entity string, id uuid.UUID) error
}

// publicDocWriter is the write half of the shared read model. It is an interface
// rather than *pubdocs.Store for one reason: the slug rule this module now leans
// on is enforced by that store, and a rule worth leaning on is worth a test that
// does not need a database. *pubdocs.Store satisfies it.
type publicDocWriter interface {
	Publish(ctx context.Context, entity string, id uuid.UUID, docs []pubdocs.Doc) error
	Unpublish(ctx context.Context, entity string, id uuid.UUID) error
	Purge(ctx context.Context, entity string, id uuid.UUID) error
}

// SetPublicDocs wires the public read model (called once at startup). Until it
// is set, publishing only writes the legacy `published_snapshot` column.
func (s *Service) SetPublicDocs(p publicDocWriter) { s.pub = p }

// SetTranslator wires the translation port (called once at startup).
func (s *Service) SetTranslator(t Translator) { s.tr = t }

// syncPublic brings the public read model in line with the page's new state: one
// document per language when published, nothing when it is not.
//
// Known limitation, the same one articles carries: this runs after the page row
// is written, not inside the same transaction. The failure mode is the safe
// direction — the public site keeps serving the previous version — but a
// rejected slug leaves the draft carrying a slug it could not publish under.
func (s *Service) syncPublic(ctx context.Context, p *Page) error {
	if s.pub == nil {
		return nil
	}
	if p.Status != PageStatusPublished {
		if err := s.pub.Unpublish(ctx, EntityPage, p.ID); err != nil {
			s.Sec(ctx).Error("unpublish public doc", "page", p.ID, "error", err)
			return apperr.Internal()
		}
		return nil
	}

	var base map[string]any
	if err := json.Unmarshal(p.PublishedSnapshot, &base); err != nil {
		s.Sec(ctx).Error("decode page snapshot", "page", p.ID, "error", err)
		return apperr.Internal()
	}
	published := time.Now()
	if p.PublishedAt != nil {
		published = *p.PublishedAt
	}

	sourceDoc := pubdocs.Doc{
		Locale: baseLocale, Slug: p.Slug, SearchText: searchText(base),
		Body: p.PublishedSnapshot, PublishedAt: published,
	}
	docs := append([]pubdocs.Doc{sourceDoc}, s.translatedDocs(ctx, p, base, published)...)

	err := s.pub.Publish(ctx, EntityPage, p.ID, docs)
	var taken pubdocs.ErrSlugTaken
	if errors.As(err, &taken) && taken.Locale != baseLocale {
		// A translated slug belongs to another page. Publish the source language
		// on its own before reporting the conflict: the publish runs in one
		// transaction, so letting it fail whole would leave a page the console
		// calls published answering 404 in every language, Vietnamese included.
		// The editor gets a 409 naming the clash and fixes that one slug; the
		// page itself is never dark.
		if err := s.pub.Publish(ctx, EntityPage, p.ID, []pubdocs.Doc{sourceDoc}); err != nil {
			s.Sec(ctx).Error("publish source doc after slug clash", "page", p.ID, "error", err)
			return apperr.Internal()
		}
		s.Sec(ctx).Warn("translated slug already taken", "page", p.ID,
			"locale", taken.Locale, "slug", taken.Slug)
		return apperr.Conflict("slug_taken")
	}
	if errors.As(err, &taken) {
		return apperr.Conflict("slug_taken")
	}
	if err != nil {
		s.Sec(ctx).Error("publish public doc", "page", p.ID, "error", err)
		return apperr.Internal()
	}
	return nil
}

// translatedDocs builds one document per extra language.
//
// A failure to load translations must not block publishing: losing the
// translated copy of one publish is better than being unable to publish at all,
// so this logs and returns what it has.
func (s *Service) translatedDocs(ctx context.Context, p *Page, base map[string]any, published time.Time) []pubdocs.Doc {
	if s.tr == nil {
		return nil
	}
	locales := s.tr.Locales(ctx)
	if len(locales) == 0 {
		return nil
	}
	byLocale, err := s.tr.Bundle(ctx, EntityPage, []uuid.UUID{p.ID}, locales)
	if err != nil {
		s.Sec(ctx).Error("load page translations", "page", p.ID, "error", err)
		return nil
	}

	out := make([]pubdocs.Doc, 0, len(locales))
	for _, locale := range locales {
		values := byLocale[p.ID][locale]
		body := pubdocs.Overlay(base, values)
		// A language with no translated slug still gets a page, under the base
		// slug. hreflang only counts when every version points at the others, so
		// an ugly URL beats a missing one.
		slug := p.Slug
		if v, ok := values["slug"].(string); ok && strings.TrimSpace(v) != "" {
			slug = strings.TrimSpace(v)
		}
		body["slug"] = slug
		raw, err := json.Marshal(body)
		if err != nil {
			s.Sec(ctx).Error("encode translated page", "page", p.ID, "locale", locale, "error", err)
			continue
		}
		out = append(out, pubdocs.Doc{
			Locale: locale, Slug: slug, SearchText: searchText(body),
			Body: raw, PublishedAt: published,
		})
	}
	return out
}

// searchText flattens the fields a reader would search a page by.
//
// A page has no excerpt, so the SEO description stands in for one: it is the
// only short prose an editor writes about the page. The body is deliberately
// left out — it is long HTML, and indexing it would make every page match
// almost anything.
func searchText(body map[string]any) string {
	parts := make([]string, 0, 2)
	if v, ok := body["title"].(string); ok && strings.TrimSpace(v) != "" {
		parts = append(parts, strings.TrimSpace(v))
	}
	if seo, ok := body["seo"].(map[string]any); ok {
		if v, ok := seo["description"].(string); ok && strings.TrimSpace(v) != "" {
			parts = append(parts, strings.TrimSpace(v))
		}
	}
	return strings.Join(parts, " ")
}

// AuthorizeTranslate is the gate the translation module calls before letting
// somebody edit this page's text. It reuses the editing gate exactly — pages are
// admin-only with no author rule, so cms.page.edit plus the page existing is the
// whole of it, and a translator cannot probe for ids that are not there.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, pageID uuid.UUID) error {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return err
	}
	if _, err := s.repo.GetPage(ctx, pageID); err != nil {
		return mapGetErr(err)
	}
	return nil
}
