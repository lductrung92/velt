// Package localize overlays stored translations onto what a LIST answers with.
//
// The console shows the same records in whichever language its interface is
// in, so a list of articles read in English should say the English title where
// somebody has written one. The translations themselves live in the
// translation module; this is the three lines of plumbing every module would
// otherwise repeat: read one locale's values for a page of ids, and pick a
// field out of them with the source language as the fallback.
//
// It is for READ-ONLY views only — lists, pickers, dashboards. An editor must
// keep showing the row's own columns: hand a translated title to a form and
// the next save writes English into the Vietnamese record.
package localize

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/translation"
)

// Bundler is the slice of the translation store this package needs. Every
// module that can be translated already holds a port with this method, so a
// caller passes the port it has rather than taking a new dependency.
type Bundler interface {
	Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error)
}

// Fields returns one locale's stored values per id.
//
// Nil — which every caller reads as "no translations, use the row" — when the
// locale is absent or is the source language, when the port is not wired, when
// there is nothing to look up, or when the read fails. A list that cannot
// reach the translation store still answers; it just answers in Vietnamese.
func Fields(
	ctx context.Context,
	b Bundler,
	entity, locale string,
	ids []uuid.UUID,
) map[uuid.UUID]map[string]any {
	if b == nil || locale == "" || locale == translation.BaseLocale || len(ids) == 0 {
		return nil
	}
	bundle, err := b.Bundle(ctx, entity, ids, []string{locale})
	if err != nil {
		return nil
	}
	out := make(map[uuid.UUID]map[string]any, len(bundle))
	for id, byLocale := range bundle {
		if values, ok := byLocale[locale]; ok && len(values) > 0 {
			out[id] = values
		}
	}
	return out
}

// Str is one translated string, or the row's own value.
//
// A field that was left blank falls back too: an empty box in the translation
// form means "I have not done this one", and showing nothing where a title
// belongs would read as a broken record rather than an untranslated one.
// Blank means blank after trimming — the store keeps what the translator
// typed, so a stray space would otherwise erase a name from the list.
func Str(values map[string]any, key, fallback string) string {
	if s, ok := text(values, key); ok {
		return s
	}
	return fallback
}

// text reads a non-blank string out of a translation, keeping it exactly as it
// was typed: only the emptiness test trims, never the value that is returned.
func text(values map[string]any, key string) (string, bool) {
	if values == nil {
		return "", false
	}
	s, ok := values[key].(string)
	if !ok || strings.TrimSpace(s) == "" {
		return "", false
	}
	return s, true
}

// StrPtr is Str for a nullable column. A row with no value of its own still
// takes the translation: a summary written only in English is better than a
// blank, and the caller asked for English.
func StrPtr(values map[string]any, key string, fallback *string) *string {
	if s, ok := text(values, key); ok {
		return &s
	}
	return fallback
}
