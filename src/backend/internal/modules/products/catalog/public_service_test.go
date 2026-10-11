package catalog

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/products/shared"
)

// fakePublicRepo stands in for Postgres. The SQL predicates are exercised by the
// integration pass against the real database; what matters here is that the
// service never widens what the repository hands it.
type fakePublicRepo struct {
	snaps map[string]json.RawMessage // slug -> snapshot
	order []string
	cats  []PublicCategory
	err   error
}

func (f *fakePublicRepo) list() ([]json.RawMessage, int, error) {
	if f.err != nil {
		return nil, 0, f.err
	}
	out := []json.RawMessage{}
	for _, slug := range f.order {
		out = append(out, f.snaps[slug])
	}
	return out, len(out), nil
}

// publicEnv wires a PublicService over a stub reader.
type publicEnv struct {
	svc  *PublicService
	repo *fakePublicRepo
}

func newPublicEnv(t *testing.T) *publicEnv {
	t.Helper()
	repo := &fakePublicRepo{snaps: map[string]json.RawMessage{}}
	return &publicEnv{repo: repo, svc: &PublicService{Base: shared.NewBase(nil)}}
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
	out := env.svc.toPublicDetail(context.Background(), sampleResponse())

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
	out := env.svc.toPublicDetail(context.Background(), bare)

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
	_, err := env.svc.GetBySlug(context.Background(), "   ")
	require.Error(t, err)
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
