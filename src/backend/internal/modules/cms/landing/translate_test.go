package landing

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

// A section is translated field by field onto what was published: the strings
// somebody wrote win, everything else — limits, flags, ids, media paths —
// stays, and an untranslated field keeps its original text rather than
// emptying.
func TestTranslatedConfig_OverlaysTextAndKeepsTheRest(t *testing.T) {
	base := json.RawMessage(`{
		"title": "Câu hỏi thường gặp",
		"subtitle": "Những thông tin cần biết.",
		"limit": 4,
		"cta_href": "/#contact",
		"seo": {"title": "Hỏi đáp", "noindex": false},
		"items": [
			{"question": "Dành cho ai?", "answer_html": "Cho mọi người."},
			{"question": "Dùng thử được không?", "answer_html": "Được."}
		]
	}`)
	values := map[string]any{"config": map[string]any{
		"title":    "Frequently asked questions",
		"subtitle": "   ", // blank: keeps the original
		"limit":    99,    // not text: ignored
		"seo":      map[string]any{"title": "FAQ"},
		"items": []any{
			map[string]any{"question": "Who is it for?"},
		},
	}}

	var got map[string]any
	require.NoError(t, json.Unmarshal(translatedConfig(base, values), &got))

	require.Equal(t, "Frequently asked questions", got["title"])
	require.Equal(t, "Những thông tin cần biết.", got["subtitle"], "a blank translation keeps the original")
	require.Equal(t, float64(4), got["limit"], "a number is not text and is never overlaid")
	require.Equal(t, "/#contact", got["cta_href"])
	require.Equal(t, "FAQ", got["seo"].(map[string]any)["title"])
	require.Equal(t, false, got["seo"].(map[string]any)["noindex"])

	items := got["items"].([]any)
	require.Len(t, items, 2, "the list keeps its length")
	first := items[0].(map[string]any)
	require.Equal(t, "Who is it for?", first["question"])
	require.Equal(t, "Cho mọi người.", first["answer_html"], "an untranslated field of a translated item stays")
	require.Equal(t, "Dùng thử được không?", items[1].(map[string]any)["question"],
		"an item the translator did not reach is untouched")
}

func TestTranslatedConfig_NothingToApply(t *testing.T) {
	base := json.RawMessage(`{"title":"Giữ nguyên"}`)
	for _, values := range []map[string]any{
		nil,
		{},
		{"config": map[string]any{}},
		{"config": "not an object"},
	} {
		require.JSONEq(t, string(base), string(translatedConfig(base, values)))
	}
	// Malformed published config is served as-is rather than dropped.
	broken := json.RawMessage(`not json`)
	require.Equal(t, string(broken),
		string(translatedConfig(broken, map[string]any{"config": map[string]any{"title": "x"}})))
}
