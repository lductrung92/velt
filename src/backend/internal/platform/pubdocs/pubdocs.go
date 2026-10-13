// Package pubdocs owns the public read model: one row per published URL.
//
// It lives in platform rather than in a module because it replaces the
// `published_snapshot` column of four different content tables, and because it
// must keep working when the translation module is switched off — with the
// translation module off it simply holds one row per record instead of two.
//
// The design is in docs/domains/translation/README.md §3.1. The short version:
// the primary key IS the URL, so a page view is one primary-key hit whatever the
// content type, a second language is another row, and a retired slug is a row
// that stayed behind to answer 301.
package pubdocs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when no row answers the lookup.
var ErrNotFound = errors.New("pubdocs: not found")

// ErrSlugTaken is returned by Publish when a slug already belongs to a different
// record of the same entity and locale. Callers surface it as 409.
type ErrSlugTaken struct {
	Locale string
	Slug   string
}

func (e ErrSlugTaken) Error() string {
	return fmt.Sprintf("pubdocs: slug %q already taken in locale %q", e.Slug, e.Locale)
}

// Doc is one published URL: the frozen body plus the two columns that exist only
// to be looked up.
type Doc struct {
	Locale      string
	Slug        string
	SearchText  string
	Body        json.RawMessage
	PublishedAt time.Time
}

// Found is the result of a lookup. A retired slug returns IsCurrent false and a
// CurrentSlug to redirect to; Body is nil in that case.
type Found struct {
	Body        json.RawMessage
	IsCurrent   bool
	CurrentSlug string
	EntityID    uuid.UUID
	PublishedAt time.Time
}

// Ref is one language's live URL for a record, for building hreflang.
type Ref struct {
	Locale string
	Slug   string
}

// Store reads and writes published_docs.
type Store struct{ pool *pgxpool.Pool }

// New builds the store over a pgx pool.
func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get resolves one URL. A retired slug is not an error: it comes back with
// IsCurrent false so the caller can answer 301 rather than 404.
func (s *Store) Get(ctx context.Context, entity, locale, slug string) (*Found, error) {
	var f Found
	err := s.pool.QueryRow(ctx,
		`SELECT body, is_current, entity_id, published_at
		   FROM published_docs
		  WHERE entity = $1 AND locale = $2 AND slug = $3`,
		entity, locale, slug).
		Scan(&f.Body, &f.IsCurrent, &f.EntityID, &f.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("pubdocs get: %w", err)
	}
	if f.IsCurrent {
		return &f, nil
	}
	// Retired slug: find where it should point now. If the record has since been
	// unpublished there is no live row, and a 404 is the honest answer.
	cur, err := s.currentSlug(ctx, entity, f.EntityID, locale)
	if errors.Is(err, ErrNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	f.CurrentSlug = cur
	return &f, nil
}

func (s *Store) currentSlug(ctx context.Context, entity string, id uuid.UUID, locale string) (string, error) {
	var slug string
	err := s.pool.QueryRow(ctx,
		`SELECT slug FROM published_docs
		  WHERE entity = $1 AND entity_id = $2 AND locale = $3 AND is_current`,
		entity, id, locale).Scan(&slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("pubdocs current slug: %w", err)
	}
	return slug, nil
}

// Alternates lists the live URL of every language for one record, for hreflang.
// It includes the language being viewed: hreflang only counts when every version
// points at the others AND at itself.
func (s *Store) Alternates(ctx context.Context, entity string, id uuid.UUID) ([]Ref, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT locale, slug FROM published_docs
		  WHERE entity = $1 AND entity_id = $2 AND is_current
		  ORDER BY locale`, entity, id)
	if err != nil {
		return nil, fmt.Errorf("pubdocs alternates: %w", err)
	}
	defer rows.Close()
	out := []Ref{}
	for rows.Next() {
		var r Ref
		if err := rows.Scan(&r.Locale, &r.Slug); err != nil {
			return nil, fmt.Errorf("pubdocs scan alternate: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Publish replaces the live set of URLs for one record, in one transaction.
//
// Slugs that disappear from the set are retired rather than deleted, so links
// already handed out keep working. Passing an empty docs set retires everything,
// which is what unpublishing means.
func (s *Store) Publish(ctx context.Context, entity string, id uuid.UUID, docs []Doc) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("pubdocs begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	locales := make([]string, len(docs))
	slugs := make([]string, len(docs))
	for i, d := range docs {
		locales[i], slugs[i] = d.Locale, d.Slug
	}

	// Retire first, not after: the partial unique index allows only one live row
	// per (entity, entity_id, locale), so inserting the new slug before releasing
	// the old one would collide with the record's own previous URL.
	if _, err := tx.Exec(ctx,
		`UPDATE published_docs SET is_current = false, body = NULL
		  WHERE entity = $1 AND entity_id = $2 AND is_current
		    AND (locale, slug) NOT IN (SELECT * FROM unnest($3::text[], $4::text[]))`,
		entity, id, locales, slugs); err != nil {
		return fmt.Errorf("pubdocs retire: %w", err)
	}

	for _, d := range docs {
		// The DO UPDATE is guarded by entity_id: if this slug belongs to another
		// record, the upsert touches nothing and we report the conflict instead of
		// quietly stealing somebody else's URL.
		tag, err := tx.Exec(ctx,
			`INSERT INTO published_docs
			        (entity, locale, slug, entity_id, is_current, search_text, body, published_at, written_at)
			 VALUES ($1, $2, $3, $4, true, $5, $6, $7, now())
			 ON CONFLICT (entity, locale, slug) DO UPDATE
			    SET is_current   = true,
			        search_text  = EXCLUDED.search_text,
			        body         = EXCLUDED.body,
			        published_at = EXCLUDED.published_at,
			        written_at   = now()
			  WHERE published_docs.entity_id = EXCLUDED.entity_id`,
			entity, d.Locale, d.Slug, id, d.SearchText, d.Body, d.PublishedAt)
		if err != nil {
			return fmt.Errorf("pubdocs upsert: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrSlugTaken{Locale: d.Locale, Slug: d.Slug}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("pubdocs commit: %w", err)
	}
	return nil
}

// Unpublish retires every live URL of a record but keeps the retired rows, so
// republishing under the same slug restores the old redirects.
func (s *Store) Unpublish(ctx context.Context, entity string, id uuid.UUID) error {
	return s.Publish(ctx, entity, id, nil)
}

// Purge removes every row of a record. The owning module calls this when it
// deletes the record itself — an orphan here is not wasted space, it is a URL
// still serving content that no longer exists.
func (s *Store) Purge(ctx context.Context, entity string, id uuid.UUID) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM published_docs WHERE entity = $1 AND entity_id = $2`, entity, id); err != nil {
		return fmt.Errorf("pubdocs purge: %w", err)
	}
	return nil
}

// Version is a token that changes whenever any published content changes.
//
// It is DERIVED, not maintained: the newest written_at across published_docs
// already moves on every publish, unpublish and slug change, so nothing has to
// remember to bump a counter. A caching reader (the public site) polls this and
// drops its cache when the token moves, which turns "wait for the TTL" into
// "visible as soon as you publish" without coupling the backend to who is
// caching or where they are.
//
// An empty table yields "0" rather than an error: no published content is a
// perfectly good state, and it is stable, which is all a cache key needs.
func (s *Store) Version(ctx context.Context) (string, error) {
	var token string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(
		         to_char(MAX(written_at) AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS.US')
		         || '-' || COUNT(*)::text,
		       '0')
		  FROM published_docs`).Scan(&token)
	if err != nil {
		return "", fmt.Errorf("published version: %w", err)
	}
	return token, nil
}
