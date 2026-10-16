package sessions

import (
	"context"

	"github.com/google/uuid"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionRevoked    = "session.revoked"
	actionRevokedAll = "session.revoked_all"
	actionPurged     = "session.purged"
)

// What the action happened to: one session, or the account whose sessions were
// all dropped at once.
const (
	entitySession = "session"
	entityUser    = "user"
)

// ownerLabel names the account behind a session — a session has no name of its
// own, so the owner is the only readable label. Best-effort: a label that
// cannot be read is worth far less than the revoke it must not block.
func (s *Service) ownerLabel(ctx context.Context, userID uuid.UUID) string {
	name, err := s.repo.UserLabel(ctx, userID)
	if err != nil {
		s.Sec(ctx).Warn("session owner label unavailable", "user", userID, "err", err)
		return ""
	}
	return name
}
