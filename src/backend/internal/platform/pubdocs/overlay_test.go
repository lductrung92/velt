package pubdocs

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Overlay is where the whole translation feature either keeps a page readable or
// serves a visitor a blank field, so each rule gets its own case.
func TestOverlay(t *testing.T) {
	base := map[string]any{
		"title":     "Kho Gọn",
		"excerpt":   "Quản lý tồn kho cho quán ăn nhiều chi nhánh.",
		"body_html": "<p>Nội dung</p>",
		"seo":       map[string]any{"title": "Kho Gọn"},
		"status":    "published",
	}

	t.Run("a translated value replaces the original", func(t *testing.T) {
		got := Overlay(base, map[string]any{"title": "Lean Stock"})
		require.Equal(t, "Lean Stock", got["title"])
	})

	t.Run("an empty string keeps the original", func(t *testing.T) {
		got := Overlay(base, map[string]any{"title": "Lean Stock", "excerpt": ""})
		require.Equal(t, base["excerpt"], got["excerpt"],
			"a half-finished translation must never show the reader a blank field")
	})

	t.Run("whitespace only keeps the original", func(t *testing.T) {
		got := Overlay(base, map[string]any{"excerpt": "   \n\t "})
		require.Equal(t, base["excerpt"], got["excerpt"])
	})

	t.Run("an absent field keeps the original", func(t *testing.T) {
		got := Overlay(base, map[string]any{"title": "Lean Stock"})
		require.Equal(t, base["body_html"], got["body_html"])
	})

	t.Run("no translation at all returns the original untouched", func(t *testing.T) {
		require.Equal(t, base, Overlay(base, nil))
	})

	t.Run("an empty object or list keeps the original", func(t *testing.T) {
		got := Overlay(base, map[string]any{"seo": map[string]any{}})
		require.Equal(t, base["seo"], got["seo"])
		got = Overlay(map[string]any{"tags": []any{"a"}}, map[string]any{"tags": []any{}})
		require.Equal(t, []any{"a"}, got["tags"])
	})

	t.Run("a false boolean is a value, not a blank", func(t *testing.T) {
		got := Overlay(map[string]any{"noindex": true}, map[string]any{"noindex": false})
		require.Equal(t, false, got["noindex"],
			"false is a deliberate answer; treating it as empty would silently ignore it")
	})

	t.Run("the base map is not mutated", func(t *testing.T) {
		Overlay(base, map[string]any{"title": "Lean Stock"})
		require.Equal(t, "Kho Gọn", base["title"],
			"the source document is reused for every locale, so overlaying one must not change it")
	})

	t.Run("a field the declaration never allowed still passes through", func(t *testing.T) {
		// Overlay itself does not police the field list — the service does, before
		// anything is stored. This records that split so nobody adds a second,
		// divergent check here.
		got := Overlay(base, map[string]any{"status": "draft"})
		require.Equal(t, "draft", got["status"])
	})
}
