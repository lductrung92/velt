package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// EntityProduct is this module's key in the shared public read model and in the
// translation store.
const EntityProduct = "product"

// baseLocale is the source language: it lives in the product's own columns and
// is never a row in the translation store.
const baseLocale = "vi"

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

// syncPublic brings the public read model in line with the product's new state:
// one document per language when published, nothing when it is not.
//
// Known limitation: this runs after the product row is written, not inside the
// same transaction. The failure mode is the safe direction — the site keeps
// serving the previous version — but a rejected slug leaves the draft carrying a
// slug it could not publish under.
func (s *Service) syncPublic(ctx context.Context, p *Product) error {
	if s.pub == nil {
		return nil
	}
	// A row with no snapshot has never been published, so it has nothing to show
	// even if the status says otherwise — the same predicate the public reader
	// applies.
	if p.Status != StatusPublished || p.PublishedSnapshot == nil {
		if err := s.pub.Unpublish(ctx, EntityProduct, p.ID); err != nil {
			s.Sec(ctx).Error("products: unpublish public doc", "product_id", p.ID, "err", err)
			return apperr.Internal()
		}
		return nil
	}

	var base map[string]any
	if err := json.Unmarshal(p.PublishedSnapshot, &base); err != nil {
		s.Sec(ctx).Error("products: decode snapshot", "product_id", p.ID, "err", err)
		return apperr.Internal()
	}
	// The snapshot froze the slug the product was published under, but the live
	// column is its address: an edit may have renamed it since. Taking the slug
	// from the row keeps a rename working without a republish, which is what the
	// slug column did when it still did the routing.
	base["slug"] = p.Slug
	raw, err := json.Marshal(base)
	if err != nil {
		s.Sec(ctx).Error("products: encode public doc", "product_id", p.ID, "err", err)
		return apperr.Internal()
	}
	published := time.Now()
	if p.PublishedAt != nil {
		published = *p.PublishedAt
	}

	sourceDoc := pubdocs.Doc{
		Locale: baseLocale, Slug: p.Slug, SearchText: searchText(base),
		Body: raw, PublishedAt: published,
	}
	docs := append([]pubdocs.Doc{sourceDoc}, s.translatedDocs(ctx, p, base, published)...)

	err = s.pub.Publish(ctx, EntityProduct, p.ID, docs)
	var taken pubdocs.ErrSlugTaken
	if errors.As(err, &taken) && taken.Locale != baseLocale {
		// A translated slug belongs to another product. Publish the source
		// language on its own before reporting the conflict: the publish runs in
		// one transaction, so letting it fail whole would leave a product the
		// console calls published answering 404 in every language, Vietnamese
		// included. The editor gets a 409 naming the clash and fixes that one
		// slug; the product itself is never dark.
		if err := s.pub.Publish(ctx, EntityProduct, p.ID, []pubdocs.Doc{sourceDoc}); err != nil {
			s.Sec(ctx).Error("products: publish source doc after slug clash", "product_id", p.ID, "err", err)
			return apperr.Internal()
		}
		s.Sec(ctx).Warn("products: translated slug already taken", "product_id", p.ID,
			"locale", taken.Locale, "slug", taken.Slug)
		return apperr.Conflict("slug_taken")
	}
	if errors.As(err, &taken) {
		return apperr.Conflict("slug_taken")
	}
	if err != nil {
		s.Sec(ctx).Error("products: publish public doc", "product_id", p.ID, "err", err)
		return apperr.Internal()
	}
	return nil
}

// translatedDocs builds one document per extra language.
//
// A failure to load translations must not block publishing: losing the
// translated copy of one publish is better than being unable to publish at all,
// so this logs and returns what it has.
func (s *Service) translatedDocs(ctx context.Context, p *Product, base map[string]any, published time.Time) []pubdocs.Doc {
	if s.tr == nil {
		return nil
	}
	locales := s.tr.Locales(ctx)
	if len(locales) == 0 {
		return nil
	}
	byLocale, err := s.tr.Bundle(ctx, EntityProduct, []uuid.UUID{p.ID}, locales)
	if err != nil {
		s.Sec(ctx).Error("products: load translations", "product_id", p.ID, "err", err)
		return nil
	}
	// The snapshot carries each category's NAME, frozen in Vietnamese at publish
	// time, and the card prints it. Without this the English catalogue shows
	// every product under a Vietnamese category — translations an editor had
	// already written and nothing ever read.
	catByLocale := map[uuid.UUID]map[string]map[string]any{}
	if ids := categoryIDs(base); len(ids) > 0 {
		if loaded, cerr := s.tr.Bundle(ctx, entityProductCategory, ids, locales); cerr == nil {
			catByLocale = loaded
		} else {
			s.Sec(ctx).Warn("products: load category translations",
				"product_id", p.ID, "err", cerr)
		}
	}

	out := make([]pubdocs.Doc, 0, len(locales))
	for _, locale := range locales {
		values := byLocale[p.ID][locale]
		body := pubdocs.Overlay(base, values)
		translateCategories(body, catByLocale, locale)
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
			s.Sec(ctx).Error("products: encode translated product", "product_id", p.ID, "locale", locale, "err", err)
			continue
		}
		out = append(out, pubdocs.Doc{
			Locale: locale, Slug: slug, SearchText: searchText(body),
			Body: raw, PublishedAt: published,
		})
	}
	return out
}

// searchText flattens the fields a reader would search a product by. Only these
// two: everything else a product carries is either a filter the list already
// offers as its own parameter (lifecycle, audience, platform) or long-form
// marketing copy that would make every product match almost anything.
func searchText(body map[string]any) string {
	parts := make([]string, 0, 2)
	for _, key := range []string{"name", "summary"} {
		if v, ok := body[key].(string); ok && strings.TrimSpace(v) != "" {
			parts = append(parts, strings.TrimSpace(v))
		}
	}
	return strings.Join(parts, " ")
}

// AuthorizeTranslate is the gate the translation module calls before letting
// somebody edit this product's text. It reuses the catalog's editing permission
// exactly, so translating a product costs what editing it costs — and an
// unknown product is a 404 rather than a row nothing will ever publish.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, productID uuid.UUID) error {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return err
	}
	if _, err := s.repo.Get(ctx, productID); err != nil {
		return s.MapRepoErr(ctx, "authorize translate", err)
	}
	return nil
}

// entityProductCategory is the translation key the product-categories module
// owns (categories.EntityCategory). It is spelled out here rather than imported
// because catalog must not depend on that package.
const entityProductCategory = "product_category"

// categoryIDs reads the ids of the categories a snapshot froze.
func categoryIDs(base map[string]any) []uuid.UUID {
	list, _ := base["categories"].([]any)
	out := make([]uuid.UUID, 0, len(list))
	for _, entry := range list {
		item, _ := entry.(map[string]any)
		raw, _ := item["id"].(string)
		if id, err := uuid.Parse(raw); err == nil {
			out = append(out, id)
		}
	}
	return out
}

// translateCategories renames a document's categories into one language, in
// place. A category with no translation keeps the name it was published under,
// which is the same rule every other field follows.
func translateCategories(
	body map[string]any,
	byLocale map[uuid.UUID]map[string]map[string]any,
	locale string,
) {
	list, _ := body["categories"].([]any)
	for _, entry := range list {
		item, _ := entry.(map[string]any)
		if item == nil {
			continue
		}
		id, err := uuid.Parse(fmt.Sprint(item["id"]))
		if err != nil {
			continue
		}
		name, _ := byLocale[id][locale]["name"].(string)
		if strings.TrimSpace(name) != "" {
			item["name"] = name
		}
	}
}
