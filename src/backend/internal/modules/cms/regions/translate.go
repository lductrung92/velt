package regions

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// EntityRegionBlock is this module's key in the translation store. One declared
// field, "config": a block's translatable text is whatever strings its widget
// config holds, and that shape differs per widget type — so the unit of
// translation is the config object itself, overlaid field by field.
const EntityRegionBlock = "region_block"

// Translator is the slice of the translation module this module needs. nil is
// allowed and means "no translations", which is also what the feature switched
// off looks like.
type Translator interface {
	Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error)
	Purge(ctx context.Context, entity string, id uuid.UUID) error
}

// SetTranslator wires the translation port into the write side, which uses it
// only to drop the copy of a block somebody removed.
func (s *Service) SetTranslator(t Translator) { s.tr = t }

// SetTranslator wires the same port into the public read path, which is the
// only place a translated block is ever used.
func (p *PublicService) SetTranslator(t Translator) { p.tr = t }

// AuthorizeTranslate gates editing a block's translated copy on the same
// permission as placing the block: translating a footer blurb is editing the
// chrome.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, blockID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	ok, err := s.repo.BlockExists(ctx, blockID)
	if err != nil {
		return apperr.Internal()
	}
	if !ok {
		return apperr.NotFound("not_found")
	}
	return nil
}

// translatedConfig overlays one language's copy onto a block's stored config.
//
// Only text is overlaid: a translation holds the strings somebody wrote, and
// everything else — limits, ids, flags, media paths — stays exactly as it was
// saved. A field left blank in the translation keeps its original, which is the
// same fallback rule the rest of the system follows.
func translatedConfig(base json.RawMessage, values map[string]any) json.RawMessage {
	raw, ok := values["config"].(map[string]any)
	if !ok || len(raw) == 0 {
		return base
	}
	var cfg map[string]any
	if err := json.Unmarshal(base, &cfg); err != nil || cfg == nil {
		return base
	}
	out, err := json.Marshal(shared.MergeText(cfg, raw))
	if err != nil {
		return base
	}
	return out
}

// purgeTranslations drops the copy of every block a save removed. A block id is
// the anchor its translation hangs from, so a row left behind would come back
// attached to a different block if the id were ever handed out again.
func (s *Service) purgeTranslations(ctx context.Context, ids []uuid.UUID) {
	if s.tr == nil {
		return
	}
	for _, id := range ids {
		if err := s.tr.Purge(ctx, EntityRegionBlock, id); err != nil {
			s.Sec(ctx).Warn("cms: purge region block translations failed", "block", id, "err", err)
		}
	}
}
