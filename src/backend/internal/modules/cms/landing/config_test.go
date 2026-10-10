package landing

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestResolveConfigMediaURLs_NestedAndIntPrecision(t *testing.T) {
	store := cmstest.NewFakeStore()
	raw := json.RawMessage(`{"image_path":"media/hero.png","limit":1000000000000000,"items":[{"image_path":"media/g1.png"}]}`)
	out := resolveConfigMediaURLs(context.Background(), store, raw)

	var m map[string]any
	require.NoError(t, json.Unmarshal(out, &m))
	require.Equal(t, "https://cdn.test/media/hero.png", m["image_url"])
	item0 := m["items"].([]any)[0].(map[string]any)
	require.Equal(t, "https://cdn.test/media/g1.png", item0["image_url"])
	// UseNumber keeps the integer exact (no float64 "1e+15" reformatting).
	require.Contains(t, string(out), "1000000000000000")
}

func TestSanitizeSectionConfig_MediaTextBodyHTML(t *testing.T) {
	raw := json.RawMessage(`{"heading":"H","body_html":"<p onclick=\"x()\">hi<script>alert(1)</script></p>"}`)
	out, err := sanitizeSectionConfig(SectionMediaText, raw, testMediaPrefix)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(out, &m))
	body, _ := m["body_html"].(string)
	require.NotContains(t, body, "<script")
	require.NotContains(t, body, "onclick")
}

func TestSanitizeSectionConfig_FAQAnswers(t *testing.T) {
	raw := json.RawMessage(`{"items":[{"question":"Q","answer_html":"<p>ok<script>bad()</script></p>"}]}`)
	out, err := sanitizeSectionConfig(SectionFAQ, raw, testMediaPrefix)
	require.NoError(t, err)
	var m struct {
		Items []map[string]any `json:"items"`
	}
	require.NoError(t, json.Unmarshal(out, &m))
	require.Len(t, m.Items, 1)
	ans, _ := m.Items[0]["answer_html"].(string)
	require.NotContains(t, ans, "<script")
	require.True(t, strings.Contains(ans, "ok"))
}

func TestSanitizeSectionConfig_RejectsDangerousScheme(t *testing.T) {
	raw := json.RawMessage(`{"heading":"H","buttons":[{"label":"go","href":"javascript:alert(1)"}]}`)
	_, err := sanitizeSectionConfig(SectionHero, raw, testMediaPrefix)
	require.Error(t, err, "a javascript: href must be rejected")
}

// testMediaPrefix stands in for a landing's own media folder in sanitize tests.
const testMediaPrefix = "cms/landing/test/"

func TestSanitizeSectionConfig_MediaPathScoping(t *testing.T) {
	// A *_path under the landing's own prefix is accepted…
	own := json.RawMessage(`{"image_path":"cms/landing/test/hero.png","items":[{"image_path":"cms/landing/test/g1.png"}]}`)
	_, err := sanitizeSectionConfig(SectionHero, own, testMediaPrefix)
	require.NoError(t, err)

	// …a path pointing at another entity / private zone is rejected (blocks the
	// spoof-then-GC-delete attack).
	foreign := json.RawMessage(`{"image_path":"customers/x/passport.pdf"}`)
	_, err = sanitizeSectionConfig(SectionHero, foreign, testMediaPrefix)
	require.Error(t, err, "a *_path outside the landing's own media folder must be rejected")

	// Nested (array item) foreign path is also caught.
	nested := json.RawMessage(`{"items":[{"image_path":"cms/landing/other/x.png"}]}`)
	_, err = sanitizeSectionConfig(SectionHero, nested, testMediaPrefix)
	require.Error(t, err)
}
