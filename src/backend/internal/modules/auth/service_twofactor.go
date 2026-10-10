package auth

import (
	"context"
	"crypto/subtle"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/platform/totp"
)

// VerifyTwoFactor completes login step 2 using a TOTP code or a recovery code.
func (s *Service) VerifyTwoFactor(ctx context.Context, req TwoFactorVerifyRequest, meta RequestMeta) (LoginResult, error) {
	if err := s.allow(ctx, "2fa:ip:"+meta.IP, rl2FAPerIP, rl2FAWindow, true); err != nil {
		return LoginResult{}, err
	}
	uid, err := s.tokens.Parse2FAChallenge(req.ChallengeToken)
	if err != nil {
		return LoginResult{}, apperr.Unauthorized("challenge_expired")
	}
	// Per-user throttle (independent of IP) so the password-verified holder of a
	// challenge token cannot brute-force TOTP codes by rotating source IPs.
	if err := s.allow(ctx, "2fa:user:"+uid.String(), rl2FAPerUser, rl2FAUserWindow, true); err != nil {
		return LoginResult{}, err
	}
	user, err := s.repo.GetUserByID(ctx, uid)
	if err != nil {
		// User vanished/disabled between steps — treat as expired challenge.
		return LoginResult{}, apperr.Unauthorized("challenge_expired")
	}
	if user.Status != statusActive {
		return LoginResult{}, apperr.AccessDenied("account_disabled")
	}
	tf, err := s.repo.GetTwoFactor(ctx, uid)
	if err != nil || !tf.Enabled() {
		return LoginResult{}, apperr.Unauthorized("invalid_2fa_code")
	}

	ok, err := s.checkTwoFactorCode(ctx, tf, req.Code)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	if !ok {
		s.sec(ctx).Warn("2fa verify failed", "user_id", uid)
		return LoginResult{}, apperr.Unauthorized("invalid_2fa_code")
	}
	return s.completeLogin(ctx, user, meta)
}

// checkTwoFactorCode validates the submitted code as a TOTP first, then as a
// single-use recovery code. On success it persists replay/used state.
func (s *Service) checkTwoFactorCode(ctx context.Context, tf *TwoFactor, code string) (bool, error) {
	secret, err := s.aead.Decrypt(tf.SecretEncrypted)
	if err != nil {
		// A decrypt failure is a server fault (corrupt secret or rotated key),
		// not a wrong code — surface it in logs instead of silently swallowing,
		// while still allowing recovery codes as a fallback.
		s.sec(ctx).Error("2fa: decrypt secret failed", "user_id", tf.UserID, "err", err)
	} else if step, ok := totp.Verify(string(secret), code, tf.LastUsedStep, s.now()); ok {
		// CAS on the replay state read above — a concurrent verify of the same step
		// leaves applied=false, which we surface as an invalid code (single-use).
		applied, err := s.repo.UpdateTwoFactorUsage(ctx, tf.UserID, &step, tf.RecoveryCodes, tf.LastUsedStep, tf.RecoveryCodes)
		if err != nil {
			return false, err
		}
		return applied, nil
	}

	h := []byte(hashRecoveryCode(code))
	for i := range tf.RecoveryCodes {
		rc := &tf.RecoveryCodes[i]
		if rc.Used {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(rc.Hash), h) == 1 {
			// Capture the pre-mutation codes so the write is a compare-and-swap:
			// two concurrent uses of the same recovery code can't both consume it.
			before := make([]RecoveryCode, len(tf.RecoveryCodes))
			copy(before, tf.RecoveryCodes)
			rc.Used = true
			applied, err := s.repo.UpdateTwoFactorUsage(ctx, tf.UserID, tf.LastUsedStep, tf.RecoveryCodes, tf.LastUsedStep, before)
			if err != nil {
				return false, err
			}
			return applied, nil
		}
	}
	return false, nil
}
