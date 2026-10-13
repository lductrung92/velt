package account

import (
	"context"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. Codes, not prose: the console
// filters on them and renders its own label per language.
const (
	actionPasswordChanged  = "account.password_changed"
	actionProfileUpdated   = "account.profile_updated"
	actionTwoFactorOn      = "account.two_factor_enabled"
	actionTwoFactorOff     = "account.two_factor_disabled"
	actionRecoveryCodesNew = "account.recovery_codes_regenerated"
)

// entityUser is the account these actions touch. It is always the caller's own
// row — this module has no other target — so actor and entity always agree,
// which is what distinguishes a self-service change from an admin's change to
// somebody else's account.
const entityUser = "user"

// SetRecorder wires the activity recorder (called once at startup). nil stays
// valid and means "do not record", which is what this module looked like
// before the activity log existed — tests need no recorder.
func (s *Service) SetRecorder(r activity.Recorder) { s.acts = r }

// record is the nil-safe funnel every call site goes through. No entity label
// is set: the recorder already resolves and stores the actor's name, and here
// the actor and the entity are the same row, so a label would only repeat it.
func (s *Service) record(ctx context.Context, id *httpx.Identity, action string, meta map[string]any) {
	if s.acts == nil {
		return
	}
	s.acts.Record(ctx, id, activity.Entry{
		Action: action, Entity: entityUser, EntityID: &id.UserID, Metadata: meta,
	})
}
