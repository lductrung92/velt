package translation

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// View is the console's picture of one record's translations.
type View struct {
	Entity             string            `json:"entity"`
	EntityID           uuid.UUID         `json:"entity_id"`
	BaseLocale         string            `json:"base_locale"`
	Locales            []string          `json:"locales"`
	TranslatableFields []string          `json:"translatable_fields"`
	Translations       map[string]Record `json:"translations"`
	RequiresRepublish  bool              `json:"requires_republish"`
}

// Service applies the rules around the store: what is declared, what is enabled,
// and who may write.
type Service struct {
	store    *Store
	settings SettingsPort
	authz    Authorizer
}

// NewService wires the translation service. authz may be nil only in tests.
func NewService(store *Store, settings SettingsPort, authz Authorizer) *Service {
	return &Service{store: store, settings: settings, authz: authz}
}

// Config returns the module's effective configuration.
func (s *Service) Config(ctx context.Context) Config { return readConfig(ctx, s.settings) }

// gate resolves the declaration and checks the caller may edit this record.
func (s *Service) gate(ctx context.Context, id *httpx.Identity, entity string, entityID uuid.UUID) (Declaration, error) {
	d, ok := Declared(entity)
	if !ok {
		// 404 and not 400: to a caller, an entity that is not declared does not
		// exist.
		return Declaration{}, apperr.NotFound("not_found")
	}
	if s.authz == nil {
		return Declaration{}, apperr.Internal()
	}
	if err := s.authz(ctx, id, entity, entityID); err != nil {
		return Declaration{}, err
	}
	return d, nil
}

// Get returns every stored language of one record.
func (s *Service) Get(ctx context.Context, id *httpx.Identity, entity string, entityID uuid.UUID) (View, error) {
	d, err := s.gate(ctx, id, entity, entityID)
	if err != nil {
		return View{}, err
	}
	recs, err := s.store.Get(ctx, entity, entityID)
	if err != nil {
		return View{}, apperr.Internal()
	}
	stale, err := s.store.RequiresRepublish(ctx, entity, entityID)
	if err != nil {
		return View{}, apperr.Internal()
	}
	cfg := s.Config(ctx)
	return View{
		Entity: entity, EntityID: entityID, BaseLocale: BaseLocale,
		Locales: cfg.Locales, TranslatableFields: d.Fields,
		Translations: recs, RequiresRepublish: stale,
	}, nil
}

// Put replaces one language of one record.
//
// Whole-block replace rather than a merge: the form sends every field, and a
// field dropped from the payload means "drop the translation, use the original
// again". A merge would need a null convention to say that.
func (s *Service) Put(ctx context.Context, id *httpx.Identity, entity string, entityID uuid.UUID, locale string, v Values) (View, error) {
	d, err := s.gate(ctx, id, entity, entityID)
	if err != nil {
		return View{}, err
	}
	cfg := s.Config(ctx)
	if !cfg.Enabled {
		return View{}, apperr.Conflict("translation_disabled")
	}
	if !cfg.Allows(locale) {
		return View{}, apperr.Unprocessable("unknown_locale")
	}
	for field := range v {
		if !d.Allows(field) {
			// Named rather than a generic validation_error: the console needs to
			// point at the offending field, and the field list is the contract.
			return View{}, &apperr.AppError{
				Status:  http.StatusUnprocessableEntity,
				Key:     "unknown_field",
				Details: map[string]any{"field": field},
			}
		}
	}
	if err := s.store.Upsert(ctx, entity, entityID, locale, v); err != nil {
		return View{}, apperr.Internal()
	}
	return s.Get(ctx, id, entity, entityID)
}

// Delete removes one language of one record. The published URL for that language
// stays up until the next publish — the public surface only ever changes when
// somebody presses Publish.
func (s *Service) Delete(ctx context.Context, id *httpx.Identity, entity string, entityID uuid.UUID, locale string) error {
	if _, err := s.gate(ctx, id, entity, entityID); err != nil {
		return err
	}
	if err := s.store.Delete(ctx, entity, entityID, locale); err != nil {
		return apperr.Internal()
	}
	return nil
}

// Bundle is the port the content modules call at publish time. It returns the
// empty map when the module is switched off, so a caller needs no flag check of
// its own.
func (s *Service) Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error) {
	if !s.Config(ctx).Enabled {
		return map[uuid.UUID]map[string]map[string]any{}, nil
	}
	return s.store.Bundle(ctx, entity, ids, locales)
}

// Locales returns the languages to publish besides Vietnamese, or nil when the
// module is off — so a content module needs no flag check of its own: it just
// publishes one document per locale it is handed.
func (s *Service) Locales(ctx context.Context) []string {
	cfg := s.Config(ctx)
	if !cfg.Enabled {
		return nil
	}
	return cfg.Locales
}

// Purge removes every translation of a record, called by the owning module.
func (s *Service) Purge(ctx context.Context, entity string, id uuid.UUID) error {
	return s.store.Purge(ctx, entity, id)
}
