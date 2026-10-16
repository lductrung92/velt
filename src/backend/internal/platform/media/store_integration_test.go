package media

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

var (
	dbOnce sync.Once
	dbPool *pgxpool.Pool
	dbErr  error
)

// requireDB returns a migrated test pool. Skips when TEST_DATABASE_URL is unset.
func requireDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	dbOnce.Do(func() {
		if dbErr = db.Migrate(url, migrations.FS); dbErr != nil {
			return
		}
		dbPool, dbErr = pgxpool.New(context.Background(), url)
	})
	if dbErr != nil {
		t.Fatalf("media test db: %v", dbErr)
	}
	return dbPool
}

// TestMintThenResolve is the round trip the whole package rests on: an upload
// path mints a row, and the serving path finds the storage key by slug alone.
func TestMintThenResolve(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	store := NewStore(pool, URLs{}, nil)

	owner := uuid.New()
	key := "cms/articles/" + owner.String() + "/featured-" + uuid.NewString() + ".png"
	data := photoPNG(t)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM files WHERE storage_key = $1`, key)
	})

	asset, err := store.Mint(ctx, MintInput{
		Key: key, Base: "featured", Data: data, OwnerKind: "article", OwnerID: &owner,
	})
	require.NoError(t, err)
	require.Regexp(t, `^featured-[0-9a-f]{8}$`, asset.Slug)
	require.Equal(t, "/img/"+asset.Slug+".png", asset.URL)
	require.Equal(t, int64(len(data)), asset.SizeBytes)
	require.Equal(t, 128, asset.Width)
	require.Equal(t, 96, asset.Height)

	got, err := store.BySlug(ctx, asset.Slug)
	require.NoError(t, err)
	require.Equal(t, key, got.StorageKey)
	require.Equal(t, asset.SHA256, got.SHA256)

	_, err = store.BySlug(ctx, "definitely-not-a-slug")
	require.ErrorIs(t, err, ErrNotFound)
}

// TestMintIsIdempotentPerStorageKey is what makes the backfill safe to re-run:
// one stored object keeps one public identity.
func TestMintIsIdempotentPerStorageKey(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	store := NewStore(pool, URLs{}, nil)

	key := "users/" + uuid.NewString() + "/avatar-" + uuid.NewString() + ".png"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM files WHERE storage_key = $1`, key)
	})

	in := MintInput{Key: key, Base: "avatar", Data: photoPNG(t), OwnerKind: "user"}
	first, err := store.Mint(ctx, in)
	require.NoError(t, err)
	second, err := store.Mint(ctx, in)
	require.NoError(t, err)
	require.Equal(t, first.Slug, second.Slug)

	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM files WHERE storage_key = $1`, key).Scan(&count))
	require.Equal(t, 1, count)
}

// TestMintRecordsNoDimensionsForANonImage keeps the width/height contract
// honest: NULL means "not a raster image", not "zero pixels".
func TestMintRecordsNoDimensionsForANonImage(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	store := NewStore(pool, URLs{FilesBase: "https://zukatek.vn"}, nil)

	key := "cms/articles/" + uuid.NewString() + "/report-" + uuid.NewString() + ".pdf"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM files WHERE storage_key = $1`, key)
	})

	asset, err := store.Mint(ctx, MintInput{
		Key: key, Base: "report", Data: []byte("%PDF-1.4 not really"), OwnerKind: "article",
	})
	require.NoError(t, err)
	require.False(t, asset.IsImage())
	require.Equal(t, "https://zukatek.vn/files/"+asset.Slug+".pdf", asset.URL)

	var width *int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT width FROM files WHERE storage_key = $1`, key).Scan(&width))
	require.Nil(t, width)
}

// TestForgetRemovesRowAndDerivativesAgainstPostgres is the delete path end to
// end: the row is gone from the table, the slug stops resolving, and the cached
// renderings are off the disk.
func TestForgetRemovesRowAndDerivativesAgainstPostgres(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	root := t.TempDir()
	keep := NewKeep(NewStore(pool, URLs{}, nil), root)

	owner := uuid.New()
	prefix := "cms/articles/" + owner.String() + "/"
	key := prefix + "featured-" + uuid.NewString() + ".png"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM files WHERE storage_key LIKE $1`, prefix+"%")
	})

	asset, err := keep.Mint(ctx, MintInput{
		Key: key, Base: "featured", Data: photoPNG(t), OwnerKind: "article", OwnerID: &owner,
	})
	require.NoError(t, err)
	cached := seedDerivatives(t, root, asset.SHA256,
		asset.SHA256+"-full.webp", asset.SHA256+"-640.webp")

	require.NoError(t, keep.Forget(ctx, key))

	_, err = keep.BySlug(ctx, asset.Slug)
	require.ErrorIs(t, err, ErrNotFound, "the slug stops resolving")
	for _, p := range cached {
		require.NoFileExists(t, p)
	}
}

// TestForgetPrefixAgainstPostgres reclaims a whole entity's folder in one
// statement — what deleting an article or a product does.
func TestForgetPrefixAgainstPostgres(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	keep := NewKeep(NewStore(pool, URLs{}, nil), t.TempDir())

	owner, other := uuid.New(), uuid.New()
	prefix := "cms/articles/" + owner.String() + "/"
	otherKey := "cms/articles/" + other.String() + "/featured-" + uuid.NewString() + ".png"
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM files WHERE storage_key LIKE $1 OR storage_key = $2`,
			prefix+"%", otherKey)
	})

	data := photoPNG(t)
	var slugs []string
	for _, base := range []string{"featured", "inline"} {
		a, err := keep.Mint(ctx, MintInput{
			Key: prefix + base + "-" + uuid.NewString() + ".png", Base: base,
			Data: data, OwnerKind: "article", OwnerID: &owner,
		})
		require.NoError(t, err)
		slugs = append(slugs, a.Slug)
	}
	survivor, err := keep.Mint(ctx, MintInput{
		Key: otherKey, Base: "featured", Data: data, OwnerKind: "article", OwnerID: &other,
	})
	require.NoError(t, err)

	require.NoError(t, keep.ForgetPrefix(ctx, prefix))
	for _, s := range slugs {
		_, err := keep.BySlug(ctx, s)
		require.ErrorIs(t, err, ErrNotFound)
	}
	// Another article's row under a sibling prefix is untouched.
	_, err = keep.BySlug(ctx, survivor.Slug)
	require.NoError(t, err)
}
