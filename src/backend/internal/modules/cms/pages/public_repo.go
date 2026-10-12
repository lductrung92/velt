package pages

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// publicDocReader is the read half of the shared read model — the mirror of
// publicDocWriter, and an interface for the same reason. *pubdocs.Store
// satisfies it.
type publicDocReader interface {
	Get(ctx context.Context, entity, locale, slug string) (*pubdocs.Found, error)
	Alternates(ctx context.Context, entity string, id uuid.UUID) ([]pubdocs.Ref, error)
}

// PublicPage is one published page exactly as the publish step froze it, plus
// every language's address for it.
type PublicPage struct {
	Snapshot pageSnapshot
	// Alternates is every language this page is published in, including the one
	// being viewed: hreflang is ignored unless each version points at the others
	// AND at itself.
	Alternates []pubdocs.Ref
}

// ErrMoved reports that the requested slug is no longer the page's address. The
// caller answers 301 rather than 404, so links already handed out survive a slug
// change and the ranking that URL earned is not thrown away.
type ErrMoved struct{ Slug string }

func (e ErrMoved) Error() string { return "page moved to " + e.Slug }

// PublicRepo reads published pages out of the shared public read model.
//
// The lookup is one primary-key hit on (entity, locale, slug). That key is the
// URL, which is why the old flat `ORDER BY parent_id NULLS FIRST LIMIT 1` over
// cms_pages — and the ambiguity it was papering over — is gone.
type PublicRepo struct {
	docs publicDocReader
}

// NewPublicRepository builds the public-read page repo over the read model.
func NewPublicRepository(docs publicDocReader) *PublicRepo { return &PublicRepo{docs: docs} }

// GetPublishedBySlug returns one published page in the requested language.
//
// Three outcomes besides the page: shared.ErrNotFound, and ErrMoved either
// because the slug was retired by a rename, or because it is another language's
// address for the same page. Both get a 301 instead of a 404, which is what
// keeps one page from living at two indexable URLs.
func (r *PublicRepo) GetPublishedBySlug(ctx context.Context, locale, slug string) (*PublicPage, error) {
	found, err := r.docs.Get(ctx, EntityPage, locale, slug)
	if errors.Is(err, pubdocs.ErrNotFound) {
		return nil, r.crossLocaleRedirect(ctx, locale, slug)
	}
	if err != nil {
		return nil, err
	}
	if !found.IsCurrent {
		return nil, ErrMoved{Slug: found.CurrentSlug}
	}
	var out PublicPage
	if err := json.Unmarshal(found.Body, &out.Snapshot); err != nil {
		return nil, fmt.Errorf("decode published page: %w", err)
	}
	alts, err := r.docs.Alternates(ctx, EntityPage, found.EntityID)
	if err != nil {
		return nil, err
	}
	out.Alternates = alts
	return &out, nil
}

// crossLocaleRedirect handles a slug that exists, but belongs to a different
// language of the same page — the case where a visitor lands on /en/<the
// Vietnamese slug> after a translated slug was set. It always returns an error.
func (r *PublicRepo) crossLocaleRedirect(ctx context.Context, locale, slug string) error {
	if locale == baseLocale {
		return shared.ErrNotFound
	}
	base, err := r.docs.Get(ctx, EntityPage, baseLocale, slug)
	if err != nil || !base.IsCurrent {
		return shared.ErrNotFound
	}
	alts, err := r.docs.Alternates(ctx, EntityPage, base.EntityID)
	if err != nil {
		return err
	}
	for _, a := range alts {
		if a.Locale == locale {
			return ErrMoved{Slug: a.Slug}
		}
	}
	return shared.ErrNotFound
}
