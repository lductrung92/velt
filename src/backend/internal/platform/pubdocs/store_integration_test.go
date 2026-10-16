package pubdocs

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

// The read model's language rules are SQL, so they are tested against a real
// database. The helper is local rather than borrowed from cms/shared/cmstest:
// a platform package must not depend on a module.
var (
	dbOnce sync.Once
	dbPool *pgxpool.Pool
	dbErr  error
)

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
	require.NoError(t, dbErr)
	return dbPool
}

const itEntity = "pubdocs_it"

func seed(t *testing.T, s *Store, id uuid.UUID, docs ...Doc) {
	t.Helper()
	require.NoError(t, s.Publish(context.Background(), itEntity, id, docs))
}

func doc(locale, slug, title string) Doc {
	body, _ := json.Marshal(map[string]any{"slug": slug, "title": title})
	return Doc{
		Locale: locale, Slug: slug, SearchText: title,
		Body: body, PublishedAt: time.Now(),
	}
}

func TestIT_UntranslatedRecordsStayVisibleAndKeepTheirAddress(t *testing.T) {
	pool := requireDB(t)
	store := New(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM published_docs WHERE entity = $1`, itEntity)
	})
	_, err := pool.Exec(ctx, `DELETE FROM published_docs WHERE entity = $1`, itEntity)
	require.NoError(t, err)

	both := uuid.New()
	onlyVi := uuid.New()
	seed(t, store, both, doc("vi", "viet-nam", "Việt"), doc("en", "english", "English"))
	seed(t, store, onlyVi, doc("vi", "chi-tieng-viet", "Chỉ tiếng Việt"))

	// The list in English holds BOTH records: the translated one in English, the
	// untranslated one in Vietnamese. Hiding it would make the English site a
	// shorter site, with nothing saying so.
	en, total, err := store.List(ctx, ListParams{Entity: itEntity, Locale: "en", Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 2, total)
	titles := map[string]bool{}
	for _, body := range en {
		var m map[string]any
		require.NoError(t, json.Unmarshal(body, &m))
		titles[m["title"].(string)] = true
	}
	require.True(t, titles["English"], "the translated record is listed in English")
	require.True(t, titles["Chỉ tiếng Việt"], "the untranslated record is still listed")

	// One row per record, not one per language.
	vi, totalVi, err := store.List(ctx, ListParams{Entity: itEntity, Locale: "vi", Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 2, totalVi)
	require.Len(t, vi, 2)

	// The untranslated record answers at its own address in either language.
	found, err := store.Get(ctx, itEntity, "en", "chi-tieng-viet")
	require.NoError(t, err)
	require.True(t, found.IsCurrent, "an untranslated record is served, not redirected")

	// The translated one does NOT: its English address exists, so the
	// Vietnamese slug asked for in English is a redirect, never a second copy.
	moved, err := store.Get(ctx, itEntity, "en", "viet-nam")
	require.NoError(t, err)
	require.False(t, moved.IsCurrent, "one page must not be readable at two addresses")
	require.Equal(t, "english", moved.CurrentSlug)

	// And each language serves its own.
	self, err := store.Get(ctx, itEntity, "en", "english")
	require.NoError(t, err)
	require.True(t, self.IsCurrent)

	// A slug nobody published is still a 404.
	_, err = store.Get(ctx, itEntity, "en", "khong-co")
	require.ErrorIs(t, err, ErrNotFound)
}

func TestIT_SearchMatchesTheLanguageTheReaderSees(t *testing.T) {
	pool := requireDB(t)
	store := New(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM published_docs WHERE entity = $1`, itEntity)
	})
	_, err := pool.Exec(ctx, `DELETE FROM published_docs WHERE entity = $1`, itEntity)
	require.NoError(t, err)

	id := uuid.New()
	seed(t, store, id, doc("vi", "ghi-chu", "Sổ ghi chú"), doc("en", "notebook", "Notebook"))

	hit, total, err := store.List(ctx, ListParams{
		Entity: itEntity, Locale: "en", Query: "Notebook", Limit: 10,
	})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, hit, 1)

	// The Vietnamese title does not match an English search: the reader searches
	// the words in front of them.
	_, none, err := store.List(ctx, ListParams{
		Entity: itEntity, Locale: "en", Query: "ghi chú", Limit: 10,
	})
	require.NoError(t, err)
	require.Equal(t, 0, none)
}

// The site's chrome is read live, never published: a widget or a menu placed
// in the header changes what every visitor sees without writing a single
// published doc. A version token that ignored cms_region_blocks would leave
// the site serving the header it cached before the edit.
func TestIT_VersionMovesWhenTheChromeChanges(t *testing.T) {
	pool := requireDB(t)
	store := New(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_region_blocks WHERE region LIKE 'pubdocsit-%'`)
	})

	before, err := store.Version(ctx)
	require.NoError(t, err)

	region := "pubdocsit-" + uuid.NewString()[:8]
	var blockID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO cms_region_blocks (region, kind, widget_type, config)
		VALUES ($1, 'widget', 'team', '{}') RETURNING id`, region).Scan(&blockID))

	placed, err := store.Version(ctx)
	require.NoError(t, err)
	require.NotEqual(t, before, placed, "placing a block in a region must move the token")

	_, err = pool.Exec(ctx,
		`UPDATE cms_region_blocks SET config = '{"limit": 4}', updated_at = now() WHERE id = $1`, blockID)
	require.NoError(t, err)

	edited, err := store.Version(ctx)
	require.NoError(t, err)
	require.NotEqual(t, placed, edited, "editing a block's config must move it too")

	_, err = pool.Exec(ctx, `DELETE FROM cms_region_blocks WHERE id = $1`, blockID)
	require.NoError(t, err)

	removed, err := store.Version(ctx)
	require.NoError(t, err)
	require.NotEqual(t, edited, removed, "removing the last block must move it as well")
}

// Hiding a real name has to reach the site now, not after the cache TTL. The
// roster is read live like the chrome is, so a member edit must move the token
// — otherwise the alias somebody just set sits behind their real name for
// however long the console configured the TTL to be.
func TestIT_VersionMovesWhenAMemberChanges(t *testing.T) {
	pool := requireDB(t)
	store := New(pool)
	ctx := context.Background()
	slug := "pubdocsit-" + uuid.NewString()[:8]
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM members WHERE slug LIKE 'pubdocsit-%'`)
	})

	before, err := store.Version(ctx)
	require.NoError(t, err)

	var memberID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO members (slug, full_name) VALUES ($1, 'Real Name') RETURNING id`,
		slug).Scan(&memberID))

	added, err := store.Version(ctx)
	require.NoError(t, err)
	require.NotEqual(t, before, added, "adding a member must move the token")

	_, err = pool.Exec(ctx,
		`UPDATE members SET display_name = 'Alias', updated_at = now() WHERE id = $1`, memberID)
	require.NoError(t, err)

	renamed, err := store.Version(ctx)
	require.NoError(t, err)
	require.NotEqual(t, added, renamed, "setting a display name must move it too")
}
