package landing

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/cms/shared"

	"github.com/velt/backend/internal/httpx"
)

// EntityLandingSection is this module's key in the translation store. One
// declared field, "config": a section's translatable text is whatever strings
// its own config holds, and that shape differs per section type — so the unit
// of translation is the config object itself, overlaid field by field.
const EntityLandingSection = "landing_section"

// Translator is the slice of the translation module this module needs. nil is
// allowed and means "no translations", which is also what the feature switched
// off looks like.
type Translator interface {
	Locales(ctx context.Context) []string
	Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error)
	Purge(ctx context.Context, entity string, id uuid.UUID) error
}

// SetTranslator wires the translation port (called once at startup).
func (s *Service) SetTranslator(t Translator) { s.tr = t }

// SetTranslator wires the same port into the public read path, which is the
// only place a translated section is ever used.
func (p *PublicService) SetTranslator(t Translator) { p.tr = t }

// AuthorizeTranslate gates editing a section's translated copy on the same
// permission as editing the landing it belongs to: translating a heading is
// editing the page.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, sectionID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	if _, err := s.repo.GetSection(ctx, sectionID); err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return apperr.NotFound("not_found")
		}
		return apperr.Internal()
	}
	return nil
}

// translatedConfig overlays one language's copy onto a section's frozen config.
//
// Only text is overlaid: a translation holds the strings somebody wrote, and
// everything else — limits, ids, flags, media paths — stays exactly as it was
// published. A field left blank in the translation keeps its original, which is
// the same fallback rule the rest of the system follows.
func translatedConfig(base json.RawMessage, values map[string]any) json.RawMessage {
	raw, ok := values["config"].(map[string]any)
	if !ok || len(raw) == 0 {
		return base
	}
	var cfg map[string]any
	if err := json.Unmarshal(base, &cfg); err != nil || cfg == nil {
		return base
	}
	merged := mergeText(cfg, raw)
	out, err := json.Marshal(merged)
	if err != nil {
		return base
	}
	return out
}

// mergeText deep-merges the translated value into the published config: objects
// recurse, arrays merge element by element (so translating the first of four
// questions leaves the other three alone), and a non-empty string wins.
func mergeText(base map[string]any, tr map[string]any) map[string]any {
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
				out[key] = mergeText(nested, typed)
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
				out[i] = mergeText(nested, typed)
			}
		}
	}
	return out
}

// purgeTranslations drops a removed section's translated copy. A section owns no
// published document of its own, so a row left behind would only cost disk — it
// is cleared anyway, because a later section could never inherit the id.
func (s *Service) purgeTranslations(ctx context.Context, sectionID uuid.UUID) {
	if s.tr == nil {
		return
	}
	if err := s.tr.Purge(ctx, EntityLandingSection, sectionID); err != nil {
		s.Sec(ctx).Warn("cms: purge section translations failed", "section", sectionID, "err", err)
	}
}
