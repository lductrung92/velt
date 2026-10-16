package media

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
)

// selectColumns is the whole read: everything needed to serve the bytes, and
// nothing about who owns them — serving does not ask.
const selectColumns = `slug, storage_key, mime, size_bytes, sha256,
       COALESCE(width, 0), COALESCE(height, 0)`

// Store is the Postgres `files` table: the Repository the serving path reads and
// the Minter the upload paths write.
type Store struct {
	pool *pgxpool.Pool
	urls URLs
	log  *slog.Logger
}

// NewStore builds the files store. urls carries the two configured base URLs
// that minted asset URLs are built from.
func NewStore(pool *pgxpool.Pool, urls URLs, log *slog.Logger) *Store {
	if log == nil {
		log = slog.Default()
	}
	return &Store{pool: pool, urls: urls, log: log}
}

// BySlug implements Repository.
func (s *Store) BySlug(ctx context.Context, slug string) (Record, error) {
	return s.one(ctx, `SELECT `+selectColumns+` FROM files WHERE slug = $1`, slug)
}

// ByStorageKeys implements BulkRepository: every row for the given keys in one
// query. Keys with no row are simply missing from the result, which is what
// lets the read path leave an un-backfilled image exactly as it was.
func (s *Store) ByStorageKeys(ctx context.Context, keys []string) ([]Record, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT `+selectColumns+` FROM files WHERE storage_key = ANY($1)`, keys)
	if err != nil {
		return nil, fmt.Errorf("files by keys: %w", err)
	}
	defer rows.Close()
	out := make([]Record, 0, len(keys))
	for rows.Next() {
		var r Record
		if err := rows.Scan(&r.Slug, &r.StorageKey, &r.MIME, &r.SizeBytes,
			&r.SHA256, &r.Width, &r.Height); err != nil {
			return nil, fmt.Errorf("scan file row: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// byStorageKey finds the row an upload already has, which is what makes minting
// idempotent: re-running the backfill, or retrying an upload that raced, adopts
// the existing identity instead of creating a second one.
func (s *Store) byStorageKey(ctx context.Context, key string) (Record, error) {
	return s.one(ctx, `SELECT `+selectColumns+` FROM files WHERE storage_key = $1`, key)
}

func (s *Store) one(ctx context.Context, query string, arg string) (Record, error) {
	var r Record
	err := s.pool.QueryRow(ctx, query, arg).Scan(
		&r.Slug, &r.StorageKey, &r.MIME, &r.SizeBytes, &r.SHA256, &r.Width, &r.Height)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrNotFound
	}
	if err != nil {
		return Record{}, fmt.Errorf("files by key: %w", err)
	}
	return r, nil
}

// mintAttempts bounds the retry when a freshly drawn slug is already taken. With
// 4 random bytes behind a per-purpose prefix, one retry is already improbable;
// five is the point at which something other than luck is wrong.
const mintAttempts = 5

// Mint implements Minter: it records the row for a stored upload and returns the
// asset's public URL. Minting the same storage key twice returns the first row.
func (s *Store) Mint(ctx context.Context, in MintInput) (Asset, error) {
	rec, err := s.byStorageKey(ctx, in.Key)
	if err == nil {
		return Asset{Record: rec, URL: s.urls.For(rec)}, nil
	}
	if !errors.Is(err, ErrNotFound) {
		s.warn(ctx, in, err)
		return Asset{}, err
	}

	rec = describe(in)
	for range mintAttempts {
		rec.Slug = mintSlug(in.Base)
		_, err := s.pool.Exec(ctx,
			`INSERT INTO files (slug, storage_key, mime, size_bytes, sha256, width, height, owner_kind, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			rec.Slug, rec.StorageKey, rec.MIME, rec.SizeBytes, rec.SHA256,
			nullInt(rec.Width), nullInt(rec.Height), in.OwnerKind, in.OwnerID)
		if err == nil {
			return Asset{Record: rec, URL: s.urls.For(rec)}, nil
		}
		if !isUniqueViolation(err) {
			s.warn(ctx, in, err)
			return Asset{}, fmt.Errorf("mint file: %w", err)
		}
		// Either the slug collided (draw again) or another writer minted this
		// same key first (adopt theirs).
		if existing, e := s.byStorageKey(ctx, in.Key); e == nil {
			return Asset{Record: existing, URL: s.urls.For(existing)}, nil
		}
	}
	err = errors.New("slug space exhausted")
	s.warn(ctx, in, err)
	return Asset{}, fmt.Errorf("mint file: %w", err)
}

// nullInt maps the 0 that means "not an image" back to SQL NULL, so the column
// says "unknown" rather than "zero pixels wide".
func nullInt(v int) *int {
	if v == 0 {
		return nil
	}
	return &v
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (s *Store) warn(ctx context.Context, in MintInput, err error) {
	s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx)).
		Warn("media: mint failed", "key", in.Key, "owner_kind", in.OwnerKind, "err", err)
}

var (
	_ Repository     = (*Store)(nil)
	_ Minter         = (*Store)(nil)
	_ BulkRepository = (*Store)(nil)
)
