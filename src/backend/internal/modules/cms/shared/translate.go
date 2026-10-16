package shared

import "strings"

// MergeText deep-merges a translated value into a published config: objects
// recurse, arrays merge element by element (so translating the first of four
// questions leaves the other three alone), and a non-empty string wins.
//
// It lives here because more than one feature stores its translatable text as a
// config object — a landing section, a chrome region block — and the overlay
// rule has to be the same one in both, or the same field would read differently
// depending on which screen placed it.
func MergeText(base map[string]any, tr map[string]any) map[string]any {
	out := make(map[string]any, len(base))
	for k, v := range base {
		out[k] = v
	}
	for key, value := range tr {
		switch typed := value.(type) {
		case string:
			if trimmed := strings.TrimSpace(typed); trimmed != "" {
				out[key] = typed
			}
		case map[string]any:
			if nested, ok := out[key].(map[string]any); ok {
				out[key] = MergeText(nested, typed)
			}
		case []any:
			if list, ok := out[key].([]any); ok {
				out[key] = mergeList(list, typed)
			}
		}
	}
	return out
}

func mergeList(base []any, tr []any) []any {
	out := make([]any, len(base))
	copy(out, base)
	for i, value := range tr {
		if i >= len(out) {
			break
		}
		switch typed := value.(type) {
		case string:
			if strings.TrimSpace(typed) != "" {
				out[i] = typed
			}
		case map[string]any:
			if nested, ok := out[i].(map[string]any); ok {
				out[i] = MergeText(nested, typed)
			}
		}
	}
	return out
}
