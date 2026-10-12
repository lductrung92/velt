package articles

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

// EntityArticle is this module's key in the shared public read model and in the
// translation store.
const EntityArticle = "article"

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

// SetPublicDocs wires the public read model (called once at startup). Until it
// is set, publishing only writes the legacy `published_snapshot` column.
func (s *Service) SetPublicDocs(p *pubdocs.Store) { s.pub = p }

// SetTranslator wires the translation port (called once at startup).
func (s *Service) SetTranslator(t Translator) { s.tr = t }

// syncPublic brings the public read model in line with the article's new state:
// one document per language when published, nothing when it is not.
//
// Known limitation: this runs after the article row is written, not inside the
// same transaction. The failure mode is the safe direction — the public site
// keeps serving the previous version — but a rejected slug leaves the draft
// carrying a slug it could not publish under. Closing that means threading the
// transaction through the repository, which is the one thing to fix before this
// is rolled out past articles.
func (s *Service) syncPublic(ctx context.Context, a *Article) error {
	if s.pub == nil {
		return nil
	}
	if a.Status != ArticleStatusPublished {
		if err := s.pub.Unpublish(ctx, EntityArticle, a.ID); err != nil {
			s.Sec(ctx).Error("unpublish public doc", "article", a.ID, "error", err)
			return apperr.Internal()
		}
		return nil
	}

	var base map[string]any
	if err := json.Unmarshal(a.PublishedSnapshot, &base); err != nil {
		s.Sec(ctx).Error("decode article snapshot", "article", a.ID, "error", err)
		return apperr.Internal()
	}
	published := time.Now()
	if a.PublishedAt != nil {
		published = *a.PublishedAt
	}

	sourceDoc := pubdocs.Doc{
		Locale: baseLocale, Slug: a.Slug, SearchText: searchText(base),
		Body: a.PublishedSnapshot, PublishedAt: published,
	}
	docs := append([]pubdocs.Doc{sourceDoc}, s.translatedDocs(ctx, a, base, published)...)

	err := s.pub.Publish(ctx, EntityArticle, a.ID, docs)
	var taken pubdocs.ErrSlugTaken
	if errors.As(err, &taken) && taken.Locale != baseLocale {
		// A translated slug belongs to another article. Publish the source
		// language on its own before reporting the conflict: the publish runs in
		// one transaction, so letting it fail whole would leave an article the
		// console calls published answering 404 in every language, Vietnamese
		// included. The editor gets a 409 naming the clash and fixes that one
		// slug; the article itself is never dark.
		if err := s.pub.Publish(ctx, EntityArticle, a.ID, []pubdocs.Doc{sourceDoc}); err != nil {
			s.Sec(ctx).Error("publish source doc after slug clash", "article", a.ID, "error", err)
			return apperr.Internal()
		}
		s.Sec(ctx).Warn("translated slug already taken", "article", a.ID,
			"locale", taken.Locale, "slug", taken.Slug)
		return apperr.Conflict("slug_taken")
	}
	if errors.As(err, &taken) {
		return apperr.Conflict("slug_taken")
	}
	if err != nil {
		s.Sec(ctx).Error("publish public doc", "article", a.ID, "error", err)
		return apperr.Internal()
	}
	return nil
}

// baseLocale is the source language: it lives in the article's own columns and
// is never a row in the translation store.
const baseLocale = "vi"

// translatedDocs builds one document per extra language.
//
// A failure to load translations must not block publishing: losing the
// translated copy of one publish is better than being unable to publish at all,
// so this logs and returns what it has.
func (s *Service) translatedDocs(ctx context.Context, a *Article, base map[string]any, published time.Time) []pubdocs.Doc {
	if s.tr == nil {
		return nil
	}
	locales := s.tr.Locales(ctx)
	if len(locales) == 0 {
		return nil
	}
	byLocale, err := s.tr.Bundle(ctx, EntityArticle, []uuid.UUID{a.ID}, locales)
	if err != nil {
		s.Sec(ctx).Error("load article translations", "article", a.ID, "error", err)
		return nil
	}

	out := make([]pubdocs.Doc, 0, len(locales))
	for _, locale := range locales {
		values := byLocale[a.ID][locale]
		body := pubdocs.Overlay(base, values)
		// A language with no translated slug still gets a page, under the base
		// slug. hreflang only counts when every version points at the others, so
		// an ugly URL beats a missing one.
		slug := a.Slug
		if v, ok := values["slug"].(string); ok && strings.TrimSpace(v) != "" {
			slug = strings.TrimSpace(v)
		}
		body["slug"] = slug
		raw, err := json.Marshal(body)
		if err != nil {
			s.Sec(ctx).Error("encode translated article", "article", a.ID, "locale", locale, "error", err)
			continue
		}
		out = append(out, pubdocs.Doc{
			Locale: locale, Slug: slug, SearchText: searchText(body),
			Body: raw, PublishedAt: published,
		})
	}
	return out
}

// searchText flattens the fields a reader would search an article by. Only these
// two: the body is long, and indexing it would make every article match almost
// anything.
func searchText(body map[string]any) string {
	parts := make([]string, 0, 2)
	for _, key := range []string{"title", "excerpt"} {
		if v, ok := body[key].(string); ok && strings.TrimSpace(v) != "" {
			parts = append(parts, strings.TrimSpace(v))
		}
	}
	return strings.Join(parts, " ")
}

// AuthorizeTranslate is the gate the translation module calls before letting
// somebody edit this article's text. It reuses the editing gate exactly, so the
// author-only rule applies to translations as it does to the original.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, articleID uuid.UUID) error {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return err
	}
	_, err := s.getOwned(ctx, id, articleID)
	return err
}
