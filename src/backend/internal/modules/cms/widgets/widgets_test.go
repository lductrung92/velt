package widgets

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
)

func TestSanitizeConfig(t *testing.T) {
	tests := []struct {
		name    string
		typ     string
		raw     string
		wantErr bool
	}{
		{"unknown type", "nope", `{}`, true},
		{"games ok", TypeGamesList, `{"limit":6}`, false},
		{"empty becomes object", TypeGamesList, ``, false},
		{"null becomes object", TypeGamesList, `null`, false},
		{"invalid json", TypeGamesList, `{`, true},
		{"rich_text ok", TypeRichText, `{"html":"<b>hi</b>"}`, false},
		{"dangerous scheme rejected", TypeCTABanner, `{"buttons":[{"href":"javascript:alert(1)"}]}`, true},
		{"data svg href rejected", TypeCTABanner, `{"buttons":[{"href":"data:image/svg+xml;base64,x"}]}`, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := SanitizeConfig(tt.typ, json.RawMessage(tt.raw))
			if tt.wantErr {
				require.Error(t, err)
				var ae *apperr.AppError
				require.ErrorAs(t, err, &ae)
				return
			}
			require.NoError(t, err)
			require.NotEmpty(t, out)
		})
	}
}

func TestSanitizeConfig_RichTextStripsScript(t *testing.T) {
	out, err := SanitizeConfig(TypeRichText, json.RawMessage(`{"html":"<b>hi</b><script>alert(1)</script>"}`))
	require.NoError(t, err)
	require.NotContains(t, string(out), "<script>")
}

type fakeGames struct{ items []GameItem }

func (f fakeGames) ListGames(context.Context, GamesQuery) ([]GameItem, error) { return f.items, nil }

type fakeArticles struct{ items []ArticleItem }

func (f fakeArticles) ListArticles(context.Context, ArticlesQuery) ([]ArticleItem, error) {
	return f.items, nil
}

type fakeCats struct{ items []CategoryItem }

func (f fakeCats) ListCategories(context.Context, CategoriesQuery) ([]CategoryItem, error) {
	return f.items, nil
}

func TestResolve(t *testing.T) {
	r := NewResolver(Ports{
		Games:      fakeGames{items: []GameItem{{Slug: "a"}}},
		Articles:   fakeArticles{items: []ArticleItem{{Slug: "x"}}},
		Categories: fakeCats{items: []CategoryItem{{Slug: "c"}}},
	})
	ctx := context.Background()

	for _, typ := range []string{TypeGamesList, TypeArticlesList, TypeCategoriesShowcase} {
		data, err := r.Resolve(ctx, typ, json.RawMessage(`{"limit":5}`))
		require.NoError(t, err)
		require.NotNil(t, data, typ)
	}

	// Static widgets resolve to nil (config is the content).
	for _, typ := range []string{TypeRichText, TypeCTABanner} {
		data, err := r.Resolve(ctx, typ, json.RawMessage(`{}`))
		require.NoError(t, err)
		require.Nil(t, data, typ)
	}
}

func TestResolve_NilPortsEmpty(t *testing.T) {
	r := NewResolver(Ports{}) // no ports wired
	data, err := r.Resolve(context.Background(), TypeGamesList, json.RawMessage(`{}`))
	require.NoError(t, err)
	require.NotNil(t, data) // empty items map, never nil
}
