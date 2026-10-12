package members

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// EntityMember is this module's key in the translation store.
const EntityMember = "member"

// baseLocale is the source language: it lives in the member's own columns and is
// never a row in the translation store.
const baseLocale = "vi"

// Translator is the slice of the translation module this module needs. It is an
// interface declared here, satisfied at wiring time, and allowed to be nil — nil
// means "no translations", which is also what the feature switched off looks
// like. Tests of this package therefore never have to build a translation module.
type Translator interface {
	// Locales returns the languages offered besides Vietnamese, nil when the
	// feature is off.
	Locales(ctx context.Context) []string
	Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error)
	Purge(ctx context.Context, entity string, id uuid.UUID) error
}

// SetTranslator wires the translation port (called once at startup).
func (s *Service) SetTranslator(t Translator) { s.tr = t }

// AuthorizeTranslate is the gate the translation module calls before letting
// somebody edit a member's text. It reuses this module's own editing gate, so
// translating a profile costs exactly what rewriting it costs.
//
// The existence check is not ceremony: a mistyped id would otherwise store text
// belonging to nobody, which no delete path can ever reach.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, memberID uuid.UUID) error {
	if err := s.require(ctx, id, permManage); err != nil {
		return err
	}
	if _, err := s.repo.Get(ctx, memberID); err != nil {
		return s.mapRepoErr(ctx, "translate: load", err)
	}
	return nil
}

// purgeTranslations drops a removed member's translated text.
//
// It runs after the delete instead of inside it because the repository hands out
// no transaction. That is affordable here and nowhere else: a member has no
// published document, so a row left behind costs disk — it is not a URL still
// serving a profile that no longer exists.
func (s *Service) purgeTranslations(ctx context.Context, memberID uuid.UUID) {
	if s.tr == nil {
		return
	}
	if err := s.tr.Purge(ctx, EntityMember, memberID); err != nil {
		s.sec(ctx).Warn("members: purge translations failed", "member_id", memberID, "err", err)
	}
}

// resolveLocale maps the ?locale= parameter onto a language that is actually
// offered. Anything unknown serves Vietnamese rather than an error: a visitor
// who mistypes a query parameter has not earned an error page.
func (s *Service) resolveLocale(ctx context.Context, raw string) string {
	want := strings.ToLower(strings.TrimSpace(raw))
	if want == "" || want == baseLocale || s.tr == nil {
		return baseLocale
	}
	for _, l := range s.tr.Locales(ctx) {
		if l == want {
			return want
		}
	}
	return baseLocale
}

// translations loads one language's values for every id in a SINGLE Bundle call,
// so a roster page costs one extra round trip however long the roster is.
//
// A failure is logged and dropped. Losing the translated copy leaves a
// Vietnamese roster, which is still a roster.
func (s *Service) translations(ctx context.Context, locale string, ids []uuid.UUID) map[uuid.UUID]map[string]any {
	if s.tr == nil || locale == baseLocale || len(ids) == 0 {
		return nil
	}
	byID, err := s.tr.Bundle(ctx, EntityMember, ids, []string{locale})
	if err != nil {
		s.sec(ctx).Error("members: load translations", "locale", locale, "err", err)
		return nil
	}
	out := make(map[uuid.UUID]map[string]any, len(byID))
	for id, byLocale := range byID {
		out[id] = byLocale[locale]
	}
	return out
}

// overlayMember lays a member's translated text over the Vietnamese one, field
// by field, so a half-finished translation still reads as a whole profile.
//
// Only `role` and `bio` take part: everything else on a profile is a name, a
// link, a skill tag or a date, and none of those are a translator's to rewrite.
func overlayMember(r *Response, values map[string]any) {
	if len(values) == 0 {
		return
	}
	merged := pubdocs.Overlay(map[string]any{"role": strAny(r.Role), "bio": strAny(r.Bio)}, values)
	r.Role, r.Bio = pickStr(merged["role"], r.Role), pickStr(merged["bio"], r.Bio)
}

// strAny unwraps an optional column for the overlay. A nil pointer must arrive
// as an untyped nil, or Overlay would treat the absent value as present.
func strAny(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

// pickStr keeps the Vietnamese value unless the overlay produced usable prose.
// The declaration limits WHICH fields may be translated, not what JSON type the
// stored value has, so a number where a string belongs must not blank a profile.
func pickStr(v any, cur *string) *string {
	s, ok := v.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return cur
	}
	return &s
}
