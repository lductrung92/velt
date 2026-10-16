package sessions

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/retention"
)

// Service holds session-control business logic.
type Service struct {
	*shared.Base
	repo Repository
}

// NewService wires the sessions service onto the shared admin base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListSessions returns a paginated page of sessions (owner resolved). The
// last-active-super-admin's sessions are flagged so the UI can warn before
// revoking (not a hard block). Requires sessions.read.
func (s *Service) ListSessions(ctx context.Context, id *httpx.Identity, f ListFilter) (shared.Page[SessionResponse], error) {
	if err := s.Require(ctx, id, permRead); err != nil {
		return shared.Page[SessionResponse]{}, err
	}
	page, pageSize := shared.NormalizePage(f.Page, f.PageSize)
	rows, total, err := s.repo.ListSessions(ctx, f, s.Now())
	if err != nil {
		return shared.Page[SessionResponse]{}, apperr.Internal()
	}
	superIDs, err := s.ActiveSuperAdminIDs(ctx)
	if err != nil {
		return shared.Page[SessionResponse]{}, apperr.Internal()
	}
	if len(superIDs) == 1 {
		last := superIDs[0]
		for i := range rows {
			if rows[i].UserID == last {
				rows[i].IsLastSuperAdmin = true
			}
		}
	}
	return shared.Page[SessionResponse]{Items: rows, Total: total, Page: page, PageSize: pageSize}, nil
}

// RevokeSession revokes one session by id. Requires sessions.revoke. Revoking the
// last super_admin's session is NOT blocked (only surfaced to the UI).
func (s *Service) RevokeSession(ctx context.Context, id *httpx.Identity, sessionID uuid.UUID) error {
	if err := s.Require(ctx, id, permKill); err != nil {
		return err
	}
	owner, err := s.repo.GetSessionUser(ctx, sessionID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	if err := s.repo.RevokeSession(ctx, sessionID, s.Now()); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin revoked session", "actor", id.UserID, "session", sessionID)
	s.Record(ctx, id, activity.Entry{
		Action: actionRevoked, Entity: entitySession, EntityID: &sessionID,
		EntityLabel: s.ownerLabel(ctx, owner),
		Metadata:    map[string]any{"user_id": owner},
	})
	return nil
}

// RevokeUserSessions revokes all of a user's sessions. Requires sessions.revoke.
func (s *Service) RevokeUserSessions(ctx context.Context, id *httpx.Identity, targetID uuid.UUID) error {
	if err := s.Require(ctx, id, permKill); err != nil {
		return err
	}
	if ok, err := s.repo.UserExists(ctx, targetID); err != nil {
		return apperr.Internal()
	} else if !ok {
		return apperr.NotFound("not_found")
	}
	if err := s.repo.RevokeAllUserSessions(ctx, targetID, s.Now()); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin revoked user sessions", "actor", id.UserID, "target", targetID)
	// The target is the account, not a session: "everything this person had open"
	// is the thing being revoked.
	s.Record(ctx, id, activity.Entry{
		Action: actionRevokedAll, Entity: entityUser, EntityID: &targetID,
		EntityLabel: s.ownerLabel(ctx, targetID),
	})
	return nil
}

// PurgeSessions permanently deletes every session older than the given
// retention window and returns how many went. Requires sessions.revoke — the
// same gate as the per-row revoke, because this is the same act in bulk.
//
// Two deliberate choices:
//
//   - The cutoff is dated from the server's clock, not taken from the request,
//     so a client with a wrong clock cannot widen the delete.
//   - The caller's OWN sessions are never deleted. The access token carries no
//     session id, so "the current session" is not identifiable here; keeping
//     every session the acting admin holds is the nearest thing that cannot
//     sign them out mid-request. The console says so.
func (s *Service) PurgeSessions(ctx context.Context, id *httpx.Identity, olderThan string) (PurgeResponse, error) {
	if err := s.Require(ctx, id, permKill); err != nil {
		return PurgeResponse{}, err
	}
	before, ok := retention.Cutoff(olderThan, s.Now())
	if !ok {
		return PurgeResponse{}, apperr.Validation(map[string]string{"older_than": "invalid"})
	}
	deleted, err := s.repo.PurgeSessions(ctx, before, id.UserID)
	if err != nil {
		return PurgeResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("admin purged sessions",
		"actor", id.UserID, "older_than", olderThan, "deleted", deleted)
	// No entity: the target is the table, not one session or one account.
	s.Record(ctx, id, activity.Entry{
		Action:   actionPurged,
		Metadata: map[string]any{"older_than": olderThan, "deleted": deleted},
	})
	return PurgeResponse{Deleted: deleted}, nil
}
