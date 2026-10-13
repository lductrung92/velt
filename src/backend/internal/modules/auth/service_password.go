package auth

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/authpolicy"
	"github.com/velt/backend/internal/platform/crypto"
)

// hashRecoveryCode hashes a recovery code for comparison against stored hashes.
func hashRecoveryCode(code string) string {
	return crypto.HashToken(strings.TrimSpace(code))
}

// SendResetLink issues a single-use password-reset token for the given user and
// emails the link. Used by admin (trigger-reset / new-user set-password) — it
// reuses auth's reset-token machinery and returns errors to the caller (unlike
// ForgotPassword, which is anti-enumeration and always succeeds).
func (s *Service) SendResetLink(ctx context.Context, userID uuid.UUID) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}
	now := s.now()
	raw, err := crypto.RandomToken(32)
	if err != nil {
		return err
	}
	if err := s.repo.InvalidateUserResetTokens(ctx, userID, now); err != nil {
		return err
	}
	tok := &ResetToken{
		ID:        uuid.New(),
		UserID:    userID,
		TokenHash: crypto.HashToken(raw),
		ExpiresAt: now.Add(s.resetTTL),
		CreatedAt: now,
	}
	if err := s.repo.CreateResetToken(ctx, tok); err != nil {
		return err
	}
	link := s.appBaseURL + "/reset-password?token=" + url.QueryEscape(raw)
	return s.mailer.SendPasswordReset(ctx, user.Email, link)
}

// ForgotPassword always succeeds from the client's perspective (no
// enumeration). If the email maps to an active user, a single-use reset token
// is created (invalidating prior tokens) and a reset link is emailed.
func (s *Service) ForgotPassword(ctx context.Context, req ForgotPasswordRequest, meta RequestMeta) error {
	if err := s.allow(ctx, "forgot:email:"+strings.ToLower(req.Email), rlForgotPerEmail, rlForgotWindow, false); err != nil {
		return err
	}
	if err := s.allow(ctx, "forgot:ip:"+meta.IP, rlForgotPerIP, rlForgotWindow, false); err != nil {
		return err
	}

	user, err := s.repo.GetUserByEmail(ctx, req.Email)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		s.sec(ctx).Error("forgot: lookup user", "err", err)
		return nil
	}
	if user.Status != statusActive {
		return nil
	}

	now := s.now()
	raw, err := crypto.RandomToken(32)
	if err != nil {
		s.sec(ctx).Error("forgot: random token", "err", err)
		return nil
	}
	if err := s.repo.InvalidateUserResetTokens(ctx, user.ID, now); err != nil {
		s.sec(ctx).Error("forgot: invalidate old tokens", "err", err)
	}
	tok := &ResetToken{
		ID:          uuid.New(),
		UserID:      user.ID,
		TokenHash:   crypto.HashToken(raw),
		ExpiresAt:   now.Add(s.resetTTL),
		RequestedIP: strPtr(meta.IP),
		CreatedAt:   now,
	}
	if err := s.repo.CreateResetToken(ctx, tok); err != nil {
		s.sec(ctx).Error("forgot: create token", "err", err)
		return nil
	}

	// Send the email off the request path so the existing-account branch does
	// not take measurably longer than the unknown-account branch (anti
	// timing-oracle). Detached context carries the correlation id for logs.
	link := s.appBaseURL + "/reset-password?token=" + url.QueryEscape(raw)
	cid := httpx.CorrelationIDFromContext(ctx)
	email := user.Email
	s.dispatch(func() {
		mctx, cancel := context.WithTimeout(httpx.WithCorrelationID(context.Background(), cid), 30*time.Second)
		defer cancel()
		if err := s.mailer.SendPasswordReset(mctx, email, link); err != nil {
			s.sec(mctx).Error("forgot: send mail", "err", err)
		}
	})
	// No actor: anyone can ask for a reset of anybody's address, and the person
	// who typed it has proved nothing yet. The account it was asked for is the
	// entity, which is also what makes a burst of these readable.
	s.record(ctx, nil, userEntry(actionResetRequest, user))
	s.sec(ctx).Info("password reset requested", "user_id", user.ID)
	return nil
}

// ResetPassword validates the token and the new password policy, then sets the
// password, marks the token used, and revokes all sessions — atomically.
func (s *Service) ResetPassword(ctx context.Context, req ResetPasswordRequest, meta RequestMeta) error {
	if err := s.allow(ctx, "reset:ip:"+meta.IP, rlResetPerIP, rlResetWindow, false); err != nil {
		return err
	}

	tok, err := s.repo.GetResetTokenByHash(ctx, crypto.HashToken(req.Token))
	if errors.Is(err, ErrNotFound) {
		return apperr.Unprocessable("invalid_or_expired_token")
	}
	if err != nil {
		return apperr.Internal()
	}
	now := s.now()
	if tok.UsedAt != nil || !tok.ExpiresAt.After(now) {
		return apperr.Unprocessable("invalid_or_expired_token")
	}

	user, err := s.repo.GetUserByID(ctx, tok.UserID)
	if err != nil || user.Status != statusActive {
		// Do not reveal whether the account is disabled/deleted.
		return apperr.Unprocessable("invalid_or_expired_token")
	}

	if key, ok := authpolicy.ValidatePassword(req.NewPassword); !ok {
		return apperr.Validation(map[string]string{"new_password": key})
	}

	hash, err := crypto.HashPassword(req.NewPassword)
	if err != nil {
		return apperr.Internal()
	}
	if err := s.repo.ResetPassword(ctx, user.ID, hash, tok.ID, now); err != nil {
		if errors.Is(err, ErrResetTokenUsed) {
			// Lost a single-use race with a concurrent reset — the token is spent.
			return apperr.Unprocessable("invalid_or_expired_token")
		}
		return apperr.Internal()
	}
	// Attributed to the account owner: the single-use token was mailed to their
	// address, so possession of it is the proof of control this flow runs on —
	// the same assumption the password change itself is already making.
	s.record(ctx, actor(user.ID), userEntry(actionResetComplete, user))
	s.sec(ctx).Info("password reset completed", "user_id", user.ID)
	return nil
}
