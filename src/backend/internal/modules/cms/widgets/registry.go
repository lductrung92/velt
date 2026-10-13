// Package widgets is the shared registry of CMS content widgets — typed,
// configurable blocks (games list, articles list, …) embeddable in pages (and
// later landing / inline rich text). One vocabulary, three concerns: validate
// config (here), resolve fresh data (resolve.go), and the type catalog. The
// renderers live in the web tier. Mirrors the landing-section config pattern so
// the two can converge later.
package widgets

import (
	"encoding/json"
	"strings"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/platform/htmlsan"
)

// Widget type ids (the shared vocabulary; see docs/domains/cms/widgets.md §2).
const (
	TypeGamesList          = "games_list"
	TypeArticlesList       = "articles_list"
	TypeCategoriesShowcase = "categories_showcase"
	TypeRichText           = "rich_text"
	TypeCTABanner          = "cta_banner"
	// The public home page's catalogue grid and team roster. Both read the
	// same published surfaces the site already serves, through ports, so a
	// landing section and the site's own list can never disagree.
	TypeProductGrid = "product_grid"
	TypeTeam        = "team"
)

const maxConfigBytes = 64 * 1024

var known = map[string]bool{
	TypeGamesList:          true,
	TypeArticlesList:       true,
	TypeCategoriesShowcase: true,
	TypeRichText:           true,
	TypeCTABanner:          true,
	TypeProductGrid:        true,
	TypeTeam:               true,
}

// IsKnownType reports whether t is a registered widget type.
func IsKnownType(t string) bool { return known[t] }

// SanitizeConfig validates + sanitizes a widget's config by type and returns
// canonical JSON. Mirrors landing.sanitizeSectionConfig: empty → "{}", a 64KB
// cap, per-type HTML allowlist (rich_text body), and a recursive reject of
// dangerous URL schemes.
func SanitizeConfig(typ string, raw json.RawMessage) (json.RawMessage, error) {
	if !known[typ] {
		return nil, apperr.Validation(map[string]string{"type": "unknown"})
	}
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage(`{}`), nil
	}
	if len(raw) > maxConfigBytes {
		return nil, apperr.Validation(map[string]string{"config": "too_large"})
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, apperr.Validation(map[string]string{"config": "invalid"})
	}
	if typ == TypeRichText {
		if v, ok := m["html"].(string); ok {
			m["html"] = htmlsan.Body(v)
		}
	}
	if hasDangerousScheme(m) {
		return nil, apperr.Validation(map[string]string{"config": "invalid_url"})
	}
	out, err := json.Marshal(m)
	if err != nil {
		return nil, apperr.Internal()
	}
	return out, nil
}

// hasDangerousScheme recursively rejects unsafe URL schemes in any string value
// of the config (defense-in-depth alongside HTML sanitizing). `data:`/`blob:` are
// blocked wholesale — config strings are titles/labels/hrefs/slugs, never inline
// data URIs — so `data:image/svg+xml` (script-bearing SVG) can't slip through an
// href that isn't run through the HTML allowlist (e.g. cta_banner buttons).
func hasDangerousScheme(v any) bool {
	switch t := v.(type) {
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		return strings.HasPrefix(s, "javascript:") ||
			strings.HasPrefix(s, "vbscript:") ||
			strings.HasPrefix(s, "data:") ||
			strings.HasPrefix(s, "blob:")
	case map[string]any:
		for _, val := range t {
			if hasDangerousScheme(val) {
				return true
			}
		}
	case []any:
		for _, val := range t {
			if hasDangerousScheme(val) {
				return true
			}
		}
	}
	return false
}
