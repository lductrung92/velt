package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/platform/crypto"
)

// Refresh rotates the refresh session and issues a new access token. It detects
// reuse of an already-revoked token and, on detection, revokes ALL of the
// user's sessions (assume theft) before failing.
func (s *Service) Refresh(ctx context.Context, rawRefresh string, meta RequestMeta) (LoginResult, error) {
	if err := s.allow(ctx, "refresh:ip:"+meta.IP, rlRefreshPerIP, rlRefreshWindow, false); err != nil {
		return LoginResult{}, err
	}
	if rawRefresh == "" {
		return LoginResult{}, apperr.Unauthorized("unauthorized")
	}
	sess, err := s.repo.GetSessionByRefreshHash(ctx, crypto.HashToken(rawRefresh))
	if errors.Is(err, ErrNotFound) {
		return LoginResult{}, apperr.Unauthorized("unauthorized")
	}
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}

	now := s.now()
	if sess.RevokedAt != nil {
		// Reuse of a revoked token → likely theft. Revoke everything.
		if err := s.repo.RevokeAllUserSessions(ctx, sess.UserID, now); err != nil {
			s.sec(ctx).Error("revoke-all after reuse", "err", err)
		}
		s.sec(ctx).Error("refresh token reuse detected", "user_id", sess.UserID)
		return LoginResult{}, apperr.Unauthorized("unauthorized")
	}
	if !sess.ExpiresAt.After(now) {
		return LoginResult{}, apperr.Unauthorized("unauthorized")
	}

	user, err := s.repo.GetUserByID(ctx, sess.UserID)
	if err != nil {
		return LoginResult{}, apperr.Unauthorized("unauthorized")
	}
	if user.Status != statusActive {
		_ = s.repo.RevokeSession(ctx, sess.ID, now)
		return LoginResult{}, apperr.Unauthorized("unauthorized")
	}

	return s.rotateAndIssue(ctx, sess.ID, user, meta, now)
}

// rotateAndIssue replaces the old refresh session with a fresh one and mints a
// new access token for the (already-validated, active) user.
func (s *Service) rotateAndIssue(ctx context.Context, oldSessionID uuid.UUID, user *User, meta RequestMeta, now time.Time) (LoginResult, error) {
	raw, err := crypto.RandomToken(32)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	newSess := &Session{
		ID:               uuid.New(),
		UserID:           user.ID,
		RefreshTokenHash: crypto.HashToken(raw),
		UserAgent:        strPtr(meta.UserAgent),
		IP:               strPtr(meta.IP),
		CreatedAt:        now,
		ExpiresAt:        now.Add(s.refreshTTL),
	}
	if err := s.repo.RotateSession(ctx, oldSessionID, newSess, now); err != nil {
		if errors.Is(err, ErrSessionReused) {
			// A concurrent Refresh already rotated this session → treat as reuse
			// (theft response): revoke everything and fail.
			if e := s.repo.RevokeAllUserSessions(ctx, user.ID, now); e != nil {
				s.sec(ctx).Error("revoke-all after rotate race", "err", e)
			}
			s.sec(ctx).Error("refresh token reuse detected (rotate race)", "user_id", user.ID)
			return LoginResult{}, apperr.Unauthorized("unauthorized")
		}
		return LoginResult{}, apperr.Internal()
	}
	roles, perms, err := s.repo.GetRolesAndPermissions(ctx, user.ID)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	access, err := s.tokens.NewAccess(user.ID, roles, perms)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	return LoginResult{
		AccessToken:      access,
		ExpiresIn:        int(s.accessTTL.Seconds()),
		User:             toUserResponse(user, s.avatarURL(ctx, user.AvatarPath)),
		RefreshToken:     raw,
		RefreshExpiresAt: newSess.ExpiresAt,
	}, nil
}

// Logout revokes the session identified by the refresh cookie. It is
// idempotent: a missing/unknown token still succeeds (so the client can clear
// state without leaking whether the token was valid).
func (s *Service) Logout(ctx context.Context, rawRefresh string) error {
	if rawRefresh == "" {
		return nil
	}
	sess, err := s.repo.GetSessionByRefreshHash(ctx, crypto.HashToken(rawRefresh))
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return apperr.Internal()
	}
	if err := s.repo.RevokeSession(ctx, sess.ID, s.now()); err != nil {
		return apperr.Internal()
	}
	return nil
}

// LogoutAll revokes every active session of the authenticated user.
func (s *Service) LogoutAll(ctx context.Context, userID uuid.UUID) error {
	if err := s.repo.RevokeAllUserSessions(ctx, userID, s.now()); err != nil {
		return apperr.Internal()
	}
	return nil
}

// Me returns the current user's profile plus freshly resolved roles and
// permissions (used by the console to restore state after reload).
func (s *Service) Me(ctx context.Context, userID uuid.UUID) (MeResponse, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return MeResponse{}, apperr.Unauthorized("unauthorized")
	}
	if err != nil {
		return MeResponse{}, apperr.Internal()
	}
	roles, perms, err := s.repo.GetRolesAndPermissions(ctx, userID)
	if err != nil {
		return MeResponse{}, apperr.Internal()
	}
	return MeResponse{
		User:        toUserResponse(user, s.avatarURL(ctx, user.AvatarPath)),
		Roles:       roles,
		Permissions: perms,
	}, nil
}
