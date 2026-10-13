package taxonomy

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Entity keys in the translation store. Categories and tags are separate
// vocabularies with separate ids, so they are separate entities there too.
const (
	EntityCategory = "cms_category"
	EntityTag      = "tag"
)

// baseLocale is the source language: it lives in the taxonomy's own columns and
// is never a row in the translation store.
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

// AuthorizeTranslateCategory gates editing a category's translated text. It
// reuses cms.taxonomy.manage: renaming a category in English is renaming it.
//
// The existence check is not ceremony — a mistyped id would otherwise store text
// belonging to nothing, which no delete path can ever reach.
func (s *Service) AuthorizeTranslateCategory(ctx context.Context, id *httpx.Identity, catID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	_, err := s.repo.GetCategory(ctx, catID)
	return mapExists(err)
}

func mapExists(err error) error {
	switch {
	case errors.Is(err, shared.ErrNotFound):
		return apperr.NotFound("not_found")
	case err != nil:
		return apperr.Internal()
	}
	return nil
}

// purgeTranslations drops a removed category's or tag's translated text.
//
// It runs after the delete instead of inside it because the repository hands out
// no transaction. That is affordable for this taxonomy and nowhere else: neither
// a category nor a tag owns a published document, so a row left behind costs
// disk — it is not a URL still serving something that no longer exists.
func (s *Service) purgeTranslations(ctx context.Context, entity string, id uuid.UUID) {
	if s.tr == nil {
		return
	}
	if err := s.tr.Purge(ctx, entity, id); err != nil {
		s.Sec(ctx).Warn("cms taxonomy: purge translations failed", "entity", entity, "id", id, "err", err)
	}
}
