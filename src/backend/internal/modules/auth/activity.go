package auth

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionSignIn        = "auth.sign_in"
	actionSignInFailed  = "auth.sign_in_failed"
	actionLockedOut     = "auth.locked_out"
	actionSignOut       = "auth.sign_out"
	actionSignOutAll    = "auth.sign_out_all"
	actionResetRequest  = "auth.password_reset_requested"
	actionResetComplete = "auth.password_reset_completed"
	// Recorded with no actor: the system detected this, nobody did it. It earns
	// a row because the response is to revoke EVERY session the account has —
	// the person is signed out everywhere at once and will ask why.
	actionSessionReuse = "auth.session_reuse_detected"
)

// Why a refresh token looked reused. Kept apart because they are not equally
// alarming: a revoked token coming back is likely theft, while a rotate race is
// usually two tabs refreshing at the same moment. A reader who cannot tell them
// apart will either panic at every row or ignore all of them.
const (
	causeRevokedTokenReplayed = "revoked_token_replayed"
	causeRotateRace           = "rotate_race"
)

// entityUser is the account an auth action happened to — for a sign-in, the
// person signing in.
const entityUser = "user"

// How a session was obtained, carried in the sign-in metadata so "signed in
// with 2FA" and "signed in with a password alone" stay distinguishable.
const (
	methodPassword  = "password"
	methodTwoFactor = "two_factor"
)

// Why a sign-in attempt produced no session.
const (
	reasonUnknownEmail  = "unknown_email"
	reasonBadPassword   = "invalid_credentials"
	reasonAccountLocked = "account_locked"
	reasonAccountOff    = "account_disabled"
	reasonBadTwoFactor  = "invalid_2fa_code"
)

// SetRecorder wires the activity recorder (called once at startup). nil stays
// valid and means "do not record", which is what this module looked like
// before the activity log existed — tests need no recorder.
func (s *Service) SetRecorder(r activity.Recorder) { s.acts = r }

// record is the nil-safe funnel every call site goes through.
func (s *Service) record(ctx context.Context, id *httpx.Identity, e activity.Entry) {
	if s.acts == nil {
		return
	}
	s.acts.Record(ctx, id, e)
}

// actor names the user an action is attributed to. Only the id is filled: the
// recorder resolves and stores the name itself.
func actor(userID uuid.UUID) *httpx.Identity { return &httpx.Identity{UserID: userID} }

// userEntry starts an entry pointed at a user account.
func userEntry(action string, u *User) activity.Entry {
	return activity.Entry{Action: action, Entity: entityUser, EntityID: &u.ID, EntityLabel: u.FullName}
}

// recordSignInFailure records an attempt that issued no session.
//
// The identity is nil on purpose: nobody authenticated, so there is nobody to
// attribute the row to. What is known is the address that was tried, and that
// goes in the metadata instead.
//
// That address is where the line is drawn, and it is drawn deliberately. A log
// of failed sign-ins is also a list of e-mail addresses somebody guessed at —
// which is exactly what makes it useful (one address across twenty accounts is
// a spray; twenty passwords against one address is a brute force) and exactly
// what makes it worth holding carefully. The submitted PASSWORD is never
// recorded, at any level of detail, not even its length: a mistyped password is
// very often the correct password for some other account, so storing it here
// would quietly turn the security log into a credential dump that anyone with
// activity.read could mine. The address answers "who was being tried"; the
// password only adds a secret for the reader to misuse.
//
// user is nil when the address matched no account, in which case the row has no
// entity — there is nothing to point at.
func (s *Service) recordSignInFailure(ctx context.Context, email string, user *User, reason string) {
	e := activity.Entry{
		Action:   actionSignInFailed,
		Metadata: map[string]any{"email": normalizeEmail(email), "reason": reason},
	}
	if user != nil {
		e.Entity, e.EntityID, e.EntityLabel = entityUser, &user.ID, user.FullName
	}
	s.record(ctx, nil, e)
}

// recordLockout records the account being locked by the failure counter. Like
// the failure itself it has no actor: the lock is the system's response to
// whoever was knocking, and blaming it on the account's owner would be a lie.
func (s *Service) recordLockout(ctx context.Context, user *User, count int, until time.Time) {
	e := userEntry(actionLockedOut, user)
	e.Metadata = map[string]any{"failed_count": count, "locked_until": until.UTC().Format(time.RFC3339)}
	s.record(ctx, nil, e)
}

// normalizeEmail lower-cases the attempted address so the same target groups
// together when the log is filtered, matching how login looks the user up.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// recordSessionReuse notes that every session of an account was revoked because
// a refresh token was presented twice.
func (s *Service) recordSessionReuse(ctx context.Context, userID uuid.UUID, cause string) {
	s.record(ctx, nil, activity.Entry{
		Action:   actionSessionReuse,
		Entity:   entityUser,
		EntityID: &userID,
		Metadata: map[string]any{"cause": cause},
	})
}
