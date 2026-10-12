package catalog

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// fakePublicRepo stands in for Postgres. The SQL predicates are exercised by the
// integration pass against the real database; what matters here is that the
// service never widens what the repository hands it.
type fakePublicRepo struct {
	docs   map[string]*PublishedProduct // "<locale>|<slug>" -> published document
	bodies []json.RawMessage
	total  int
	cats   []PublicCategory
	moved  string // non-empty → GetPublishedBySlug reports a 301 target

	lastParams PublicListParams
	lastLocale string
}

func (f *fakePublicRepo) ListPublished(_ context.Context, p PublicListParams) ([]json.RawMessage, int, error) {
	f.lastParams = p
	return f.bodies, f.total, nil
}

func (f *fakePublicRepo) GetPublishedBySlug(_ context.Context, locale, slug string) (*PublishedProduct, error) {
	f.lastLocale = locale
	if f.moved != "" {
		return nil, ErrMoved{Slug: f.moved}
	}
	if d, ok := f.docs[locale+"|"+slug]; ok {
		return d, nil
	}
	return nil, shared.ErrNotFound
}

func (f *fakePublicRepo) ListPublicCategories(context.Context) ([]PublicCategory, error) {
	return f.cats, nil
}

func (f *fakePublicRepo) IDsBySlugs(context.Context, []string) ([]uuid.UUID, error) {
	return nil, nil
}

// fakeLocales stands in for the translation module's language list.
type fakeLocales struct{ list []string }

func (f fakeLocales) Locales(context.Context) []string { return f.list }

// publicEnv wires a PublicService over a stub reader.
type publicEnv struct {
	svc  *PublicService
	repo *fakePublicRepo
}

func newPublicEnv(t *testing.T) *publicEnv {
	t.Helper()
	repo := &fakePublicRepo{docs: map[string]*PublishedProduct{}}
	return &publicEnv{repo: repo, svc: NewPublicService(shared.NewBase(nil), repo, nil)}
}

// snapshotOf freezes a Response exactly the way transition() does.
func snapshotOf(t *testing.T, r Response) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(r)
	require.NoError(t, err)
	return b
}

func sampleResponse() Response {
	now := time.Now().UTC()
	s := func(v string) *string { return &v }
	return Response{
		ID: uuid.New(), Slug: "bang-cong-viec", Name: "Bảng công việc",
		Summary: s("Không gian sắp xếp công việc."), BodyHTML: s("<p>Giới thiệu</p>"),
		CoverURL: s("/api/files/products/p1/cover.png"),
		// A storage key and the editorial state ride along in the snapshot; both
		// must be dropped on the way out.
		CoverPath: s("products/p1/cover.png"),
		Status:    "published", Lifecycle: "launched",
		Version: s("1.0.0"), ReleasedAt: s("2026-03-01"),
		Audience: []string{"team"}, Platforms: []string{"web"},
		TechStack: []string{"Go"}, Highlights: []string{"Đồng bộ thời gian thực"},
		IsFeatured: true, SortOrder: 3,
		DemoURL: s("https://demo.example/x"), DemoAccess: s("Không cần đăng nhập"),
		DemoInstructions: []string{"Chọn dữ liệu mẫu"},
		SEO:              SEO{Title: s("Bảng công việc"), OGPath: s("products/p1/og.png")},
		Categories:       []CategoryRef{{ID: uuid.New(), Slug: "cong-tac", Name: "Cộng tác"}},
		Members: []MemberRef{{
			ID: uuid.New(), Slug: "an-nguyen", FullName: "An Nguyễn",
			Role: s("Backend"), SortOrder: 0,
		}},
		Gallery: []MediaItem{{
			ID: uuid.New(), Kind: "image", URL: s("/api/files/products/p1/g1.png"),
			Caption: s("Màn hình chính"), SortOrder: 0,
		}},
		PublishedAt: &now, CreatedAt: now, UpdatedAt: now,
	}
}

func TestPublicDetailDropsInternalFields(t *testing.T) {
	env := newPublicEnv(t)
	out := env.svc.toPublicDetail(context.Background(), sampleResponse(), baseLocale, nil)

	body, err := json.Marshal(out)
	require.NoError(t, err)
	wire := string(body)

	// The snapshot carries these; the public response must not.
	for _, leak := range []string{"cover_path", `"status"`, "sort_order", "body_json", `"id"`} {
		require.NotContains(t, wire, leak, "public detail leaks %s", leak)
	}
	// …while still carrying what the page needs.
	require.Contains(t, wire, "bang-cong-viec")
	require.Contains(t, wire, "Đồng bộ thời gian thực")
	require.Equal(t, "An Nguyễn", out.Members[0].FullName)
	require.Equal(t, "Backend", *out.Members[0].Role)
	require.Equal(t, "cong-tac", out.Categories[0].Slug)
	require.Len(t, out.Gallery, 1)
}

func TestPublicListItemCarriesOnlyCardFields(t *testing.T) {
	env := newPublicEnv(t)
	item := toPublicListItem(sampleResponse())

	body, err := json.Marshal(item)
	require.NoError(t, err)
	wire := string(body)

	// A list row must not ship the whole article body to render a card.
	require.NotContains(t, wire, "body_html")
	require.NotContains(t, wire, "cover_path")
	require.NotContains(t, wire, "tech_stack")
	require.Contains(t, wire, "Bảng công việc")
	require.True(t, item.IsFeatured)
	_ = env
}

func TestPublicEmptyListsSerializeAsArrays(t *testing.T) {
	// The site should never have to tell "no categories" from "not loaded".
	env := newPublicEnv(t)
	bare := Response{Slug: "x", Name: "X", Lifecycle: "idea"}
	out := env.svc.toPublicDetail(context.Background(), bare, baseLocale, nil)

	body, err := json.Marshal(out)
	require.NoError(t, err)
	wire := string(body)
	for _, key := range []string{
		`"audience":[]`, `"platforms":[]`, `"tech_stack":[]`, `"highlights":[]`,
		`"categories":[]`, `"members":[]`, `"gallery":[]`, `"instructions":[]`,
	} {
		require.Contains(t, wire, key)
	}
	// Optional scalars are legitimately null (summary, cover_url…); only the
	// lists are required to be arrays.
	for _, key := range []string{
		"audience", "platforms", "tech_stack", "highlights",
		"categories", "members", "gallery", "instructions",
	} {
		require.NotContains(t, wire, `"`+key+`":null`)
	}
}

func TestPublicListParamsNormalize(t *testing.T) {
	t.Run("clamps paging", func(t *testing.T) {
		got := PublicListParams{Page: 0, PageSize: 0}.normalize()
		require.Equal(t, 1, got.Page)
		require.Equal(t, publicDefaultPageSize, got.PageSize)

		got = PublicListParams{Page: -5, PageSize: 9999}.normalize()
		require.Equal(t, 1, got.Page)
		require.Equal(t, publicMaxPageSize, got.PageSize)
	})

	t.Run("rejects unknown sort rather than passing it to SQL", func(t *testing.T) {
		// The sort key is interpolated into the ORDER BY clause, so anything
		// outside the allowlist has to collapse to the default.
		for _, bad := range []string{"", "updated_at", "name; DROP TABLE products", "../"} {
			require.Equal(t, "featured", PublicListParams{Sort: bad}.normalize().Sort)
		}
		for _, good := range []string{"name", "newest", "featured"} {
			require.Equal(t, good, PublicListParams{Sort: good}.normalize().Sort)
		}
	})
}

func TestPublicGetRejectsBlankSlug(t *testing.T) {
	env := newPublicEnv(t)
	_, err := env.svc.GetBySlug(context.Background(), "", "   ")
	require.Error(t, err)
}

func TestPublicResolveLocale(t *testing.T) {
	env := newPublicEnv(t)
	ctx := context.Background()

	// No translation module wired: everything is the source language.
	require.Equal(t, baseLocale, env.svc.resolveLocale(ctx, "en"))

	env.svc.SetLocales(fakeLocales{list: []string{"en"}})
	require.Equal(t, "en", env.svc.resolveLocale(ctx, " EN "))
	require.Equal(t, baseLocale, env.svc.resolveLocale(ctx, ""))
	// A mistyped parameter serves the original rather than an error page.
	require.Equal(t, baseLocale, env.svc.resolveLocale(ctx, "fr"))
}

func TestPublicListPassesResolvedLocale(t *testing.T) {
	env := newPublicEnv(t)
	env.svc.SetLocales(fakeLocales{list: []string{"en"}})

	_, err := env.svc.List(context.Background(), PublicListParams{Locale: "en"})
	require.NoError(t, err)
	require.Equal(t, "en", env.repo.lastParams.Locale)

	_, err = env.svc.List(context.Background(), PublicListParams{Locale: "fr"})
	require.NoError(t, err)
	require.Equal(t, baseLocale, env.repo.lastParams.Locale)
}

func TestPublicGetBySlugMovedReachesCaller(t *testing.T) {
	// The handler needs the 301 target, so ErrMoved must not be flattened into
	// a 404 on the way out of the service.
	env := newPublicEnv(t)
	env.repo.moved = "lean-stock"

	_, err := env.svc.GetBySlug(context.Background(), "", "kho-gon")
	var moved ErrMoved
	require.ErrorAs(t, err, &moved)
	require.Equal(t, "lean-stock", moved.Slug)
}

func TestPublicGetBySlugAlternatesIncludeSelf(t *testing.T) {
	env := newPublicEnv(t)
	env.svc.SetLocales(fakeLocales{list: []string{"en"}})
	env.repo.docs["en|lean-stock"] = &PublishedProduct{
		Body: snapshotOf(t, sampleResponse()),
		Alternates: []pubdocs.Ref{
			{Locale: "vi", Slug: "bang-cong-viec"}, {Locale: "en", Slug: "lean-stock"},
		},
	}

	out, err := env.svc.GetBySlug(context.Background(), "en", "lean-stock")
	require.NoError(t, err)
	require.Equal(t, "en", out.Locale)
	require.Equal(t, "en", env.repo.lastLocale)
	// hreflang is ignored unless every version points at the others and itself,
	// and x-default is the source language.
	require.Len(t, out.Alternates, 2)
	require.True(t, out.Alternates[0].XDefault)
	require.False(t, out.Alternates[1].XDefault)
	require.Equal(t, "lean-stock", out.Alternates[1].Slug)
}

func TestPublicSortClauseIsFixedText(t *testing.T) {
	// Guards the only place user input could reach the SQL text.
	require.Contains(t, publicSortClause("name"), "'name'")
	require.Contains(t, publicSortClause("newest"), "published_at")
	require.Equal(t, publicSortClause("featured"), publicSortClause("anything else"))
}

func TestJSONScalarEscapes(t *testing.T) {
	require.Equal(t, `"web"`, jsonScalar("web"))
	require.Equal(t, `"a\"b"`, jsonScalar(`a"b`))
}
