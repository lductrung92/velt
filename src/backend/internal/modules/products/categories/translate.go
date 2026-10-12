package categories

import (
	"context"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
)

// EntityCategory is this module's key in the translation store.
const EntityCategory = "product_category"

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
// somebody edit a category's text. It reuses this module's own editing gate, so
// renaming a category in English costs what renaming it costs.
//
// The existence check is not ceremony: a mistyped id would otherwise store text
// belonging to nothing, which no delete path can ever reach.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, catID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	if _, err := s.repo.Get(ctx, catID); err != nil {
		return s.MapRepoErr(ctx, "translate category: load", err)
	}
	return nil
}

// purgeTranslations drops a removed category's translated text.
//
// It runs after the delete instead of inside it because the repository hands out
// no transaction. That is affordable here and nowhere else: a product category
// owns no published document, so a row left behind costs disk — it is not a URL
// still serving a category that no longer exists.
func (s *Service) purgeTranslations(ctx context.Context, catID uuid.UUID) {
	if s.tr == nil {
		return
	}
	if err := s.tr.Purge(ctx, EntityCategory, catID); err != nil {
		s.Sec(ctx).Warn("products: purge category translations failed", "category", catID, "err", err)
	}
}
