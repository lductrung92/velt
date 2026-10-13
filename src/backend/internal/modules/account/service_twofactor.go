package account

import (
	"context"
	"errors"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/totp"
)

// SetupTwoFactor creates a pending TOTP secret and returns the otpauth URL + QR
// for enrollment. It overwrites any pending secret; it refuses only when 2FA is
// already enabled.
func (s *Service) SetupTwoFactor(ctx context.Context, id *httpx.Identity) (SetupResult, error) {
	if id == nil {
		return SetupResult{}, apperr.Unauthorized("unauthorized")
	}
	if err := s.allow(ctx, "account:2fa:user:"+id.UserID.String(), rl2FA, rl2FAWindow); err != nil {
		return SetupResult{}, err
	}
	tf, err := s.repo.GetTwoFactor(ctx, id.UserID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return SetupResult{}, apperr.Internal()
	}
	if tf.Enabled() {
		return SetupResult{}, apperr.Conflict("two_factor_already_enabled")
	}
	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if err != nil {
		return SetupResult{}, apperr.Internal()
	}
	secret, url, err := totp.GenerateSecret(s.issuer, user.Email)
	if err != nil {
		return SetupResult{}, apperr.Internal()
	}
	enc, err := s.aead.Encrypt([]byte(secret))
	if err != nil {
		return SetupResult{}, apperr.Internal()
	}
	if err := s.repo.UpsertPendingSecret(ctx, id.UserID, enc); err != nil {
		return SetupResult{}, apperr.Internal()
	}
	qr, err := totp.QRCodeSVG(url)
	if err != nil {
		return SetupResult{}, apperr.Internal()
	}
	return SetupResult{OtpauthURL: url, QRSVG: qr, ManualKey: secret}, nil
}

// EnableTwoFactor confirms enrollment with a TOTP code, activates 2FA, and
// returns the recovery codes ONCE.
func (s *Service) EnableTwoFactor(ctx context.Context, id *httpx.Identity, req Enable2FARequest) ([]string, error) {
	if id == nil {
		return nil, apperr.Unauthorized("unauthorized")
	}
	if err := s.allow(ctx, "account:2fa:user:"+id.UserID.String(), rl2FA, rl2FAWindow); err != nil {
		return nil, err
	}
	tf, err := s.repo.GetTwoFactor(ctx, id.UserID)
	if errors.Is(err, ErrNotFound) {
		return nil, apperr.Conflict("two_factor_not_pending")
	}
	if err != nil {
		return nil, apperr.Internal()
	}
	if tf.Enabled() {
		return nil, apperr.Conflict("two_factor_not_pending")
	}
	secret, err := s.aead.Decrypt(tf.SecretEncrypted)
	if err != nil {
		s.sec(ctx).Error("2fa enable: decrypt secret failed", "user_id", id.UserID, "err", err)
		return nil, apperr.Internal()
	}
	step, ok := totp.Verify(string(secret), req.Code, tf.LastUsedStep, s.now())
	if !ok {
		return nil, apperr.Unauthorized("invalid_2fa_code")
	}
	raw, codes, err := totp.GenerateRecoveryCodes(s.recoveryCount)
	if err != nil {
		return nil, apperr.Internal()
	}
	if err := s.repo.EnableTwoFactor(ctx, id.UserID, codes, s.now(), step); err != nil {
		return nil, apperr.Internal()
	}
	s.record(ctx, id, actionTwoFactorOn, nil)
	s.sec(ctx).Info("2fa enabled", "user_id", id.UserID)
	return raw, nil
}

// DisableTwoFactor turns off 2FA after re-authenticating with the password.
func (s *Service) DisableTwoFactor(ctx context.Context, id *httpx.Identity, req Password2FARequest) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	if err := s.allow(ctx, "account:2fa:user:"+id.UserID.String(), rl2FA, rl2FAWindow); err != nil {
		return err
	}
	if err := s.reauth(ctx, id, req.Password); err != nil {
		return err
	}
	tf, err := s.repo.GetTwoFactor(ctx, id.UserID)
	if errors.Is(err, ErrNotFound) || (err == nil && !tf.Enabled()) {
		return apperr.Conflict("two_factor_not_enabled")
	}
	if err != nil {
		return apperr.Internal()
	}
	if err := s.repo.DeleteTwoFactor(ctx, id.UserID); err != nil {
		return apperr.Internal()
	}
	// Turning the second factor off weakens the account, so it is exactly the
	// kind of change somebody may later be asked about.
	s.record(ctx, id, actionTwoFactorOff, nil)
	s.sec(ctx).Info("2fa disabled", "user_id", id.UserID)
	return nil
}

// RegenerateRecoveryCodes invalidates old recovery codes and returns new ones
// (re-auth via password).
func (s *Service) RegenerateRecoveryCodes(ctx context.Context, id *httpx.Identity, req Password2FARequest) ([]string, error) {
	if id == nil {
		return nil, apperr.Unauthorized("unauthorized")
	}
	if err := s.allow(ctx, "account:2fa:user:"+id.UserID.String(), rl2FA, rl2FAWindow); err != nil {
		return nil, err
	}
	if err := s.reauth(ctx, id, req.Password); err != nil {
		return nil, err
	}
	tf, err := s.repo.GetTwoFactor(ctx, id.UserID)
	if errors.Is(err, ErrNotFound) || (err == nil && !tf.Enabled()) {
		return nil, apperr.Conflict("two_factor_not_enabled")
	}
	if err != nil {
		return nil, apperr.Internal()
	}
	raw, codes, err := totp.GenerateRecoveryCodes(s.recoveryCount)
	if err != nil {
		return nil, apperr.Internal()
	}
	if err := s.repo.UpdateRecoveryCodes(ctx, id.UserID, codes); err != nil {
		return nil, apperr.Internal()
	}
	// The codes themselves are a credential and stay out of the row; only the
	// fact that the old set was invalidated is recorded.
	s.record(ctx, id, actionRecoveryCodesNew, nil)
	s.sec(ctx).Info("2fa recovery codes regenerated", "user_id", id.UserID)
	return raw, nil
}

// reauth verifies the caller's current password for a sensitive action.
func (s *Service) reauth(ctx context.Context, id *httpx.Identity, password string) error {
	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if err != nil {
		return apperr.Internal()
	}
	if ok, _ := crypto.VerifyPassword(password, user.PasswordHash); !ok {
		s.sec(ctx).Warn("account: re-auth failed", "user_id", id.UserID)
		return apperr.Unauthorized("invalid_credentials")
	}
	return nil
}
