package pubdocs

import "strings"

// Overlay lays translated values over the base ones and returns the result.
//
// This is the single place the fallback rule is applied, and it runs at publish
// time rather than at read time: a missing, empty or whitespace-only translation
// keeps the Vietnamese value, so a visitor never meets a blank field and a page
// stays readable while it is only half translated.
func Overlay(base, tr map[string]any) map[string]any {
	out := make(map[string]any, len(base))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range tr {
		if isBlank(v) {
			continue
		}
		// A nested object is overlaid key by key, not replaced whole. The `seo`
		// block is one field to the declaration but several to a translator:
		// replacing it outright would mean filling in an English SEO title
		// silently dropped the Vietnamese description, which is the opposite of
		// what the fallback rule promises.
		if sub, ok := v.(map[string]any); ok {
			if baseSub, ok := out[k].(map[string]any); ok {
				out[k] = Overlay(baseSub, sub)
				continue
			}
		}
		out[k] = v
	}
	return out
}

func isBlank(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(t) == ""
	case map[string]any:
		return len(t) == 0
	case []any:
		return len(t) == 0
	default:
		return false
	}
}
