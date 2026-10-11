package members

import (
	"context"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/platform/slug"
)

// resolveSlug normalises the requested slug (or derives one from the name) and
// makes it unique.
//
// Unlike CMS articles — where manual slug editing is a feature flag — a member
// slug is always user-editable but never allowed to collide: it is the key in
// the referral link (/?ref=<slug>), so a surprise 404 is worse than a surprise
// suffix. A taken slug therefore gets -01, -02, … rather than an error.
//
// excludeID is the row being edited (nil on create) so a member keeps its own
// slug on an unrelated PATCH.
func (s *Service) resolveSlug(ctx context.Context, provided *string, name string, excludeID *uuid.UUID) (string, error) {
	base := ""
	if provided != nil {
		base = slug.Make(*provided)
	}
	if base == "" {
		base = slug.Make(name)
	}
	if base == "" {
		// Name was punctuation/emoji only — nothing usable to build a URL from.
		return "", apperr.Validation(map[string]string{"slug": "invalid"})
	}

	out, err := slug.Unique(func(cand string) (bool, error) {
		return s.repo.SlugExists(ctx, cand, excludeID)
	}, base)
	if err != nil {
		s.sec(ctx).Error("members: resolve slug", "err", err)
		return "", apperr.Internal()
	}
	return out, nil
}
