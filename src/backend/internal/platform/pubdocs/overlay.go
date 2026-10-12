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
		if !isBlank(v) {
			out[k] = v
		}
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
