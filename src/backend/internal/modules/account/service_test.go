package account

import (
	"bytes"
	"context"
	"net/http"
	"testing"

	gototp "github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
)

func TestGetProfile_No2FA(t *testing.T) {
	env := newTestSvc(t)
	res, err := env.svc.GetProfile(context.Background(), env.id)
	require.NoError(t, err)
	require.Equal(t, "user@example.com", res.User.Email)
	require.False(t, res.TwoFactorEnabled)
	require.Nil(t, res.RecoveryCodesRemaining)
}

func TestUpdateProfile(t *testing.T) {
	env := newTestSvc(t)
	user, err := env.svc.UpdateProfile(context.Background(), env.id, UpdateProfileRequest{FullName: "  New Name  "})
	require.NoError(t, err)
	require.Equal(t, "New Name", user.FullName) // trimmed
	require.Equal(t, "New Name", env.repo.user.FullName)
}

func TestUpdateProfile_Validation(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.UpdateProfile(context.Background(), env.id, UpdateProfileRequest{FullName: "   "})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")

	long := make([]byte, 121)
	for i := range long {
		long[i] = 'a'
	}
	_, err = env.svc.UpdateProfile(context.Background(), env.id, UpdateProfileRequest{FullName: string(long)})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestChangePassword_Success(t *testing.T) {
	env := newTestSvc(t)
	res, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: currentPassword, NewPassword: "a-brand-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.AccessToken)
	require.NotEmpty(t, res.RefreshToken)
	require.True(t, env.repo.revokedAll, "all sessions revoked")
	require.NotNil(t, env.repo.newSession, "new session created for current device")

	ok, _ := crypto.VerifyPassword("a-brand-new-password", env.repo.user.PasswordHash)
	require.True(t, ok)
}

func TestChangePassword_WrongCurrent(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: "wrong", NewPassword: "a-brand-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
	require.False(t, env.repo.revokedAll)
}

func TestChangePassword_WeakNew(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: currentPassword, NewPassword: "short"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestChangePassword_Unchanged(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: currentPassword, NewPassword: currentPassword},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "password_unchanged")
}

func TestChangePassword_RateLimited(t *testing.T) {
	env := newTestSvc(t)
	var err error
	for i := 0; i < rlChangePw+1; i++ {
		_, err = env.svc.ChangePassword(context.Background(), env.id,
			ChangePasswordRequest{CurrentPassword: "wrong", NewPassword: "a-brand-new-password"},
			RequestMeta{IP: "1.2.3.4"})
	}
	assertAppErr(t, err, http.StatusTooManyRequests, "rate_limited")
}

func TestChangePassword_LimiterError_FailsClosed(t *testing.T) {
	env := newTestSvcWith(t, errLimiter{})
	_, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: currentPassword, NewPassword: "a-brand-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusTooManyRequests, "rate_limited")
}

// --- 2FA ---

func setupAndCode(t *testing.T, env *tenv) (SetupResult, string) {
	t.Helper()
	res, err := env.svc.SetupTwoFactor(context.Background(), env.id)
	require.NoError(t, err)
	code, err := gototp.GenerateCode(res.ManualKey, env.clk)
	require.NoError(t, err)
	return res, code
}

func TestTwoFactor_SetupReturnsQR(t *testing.T) {
	env := newTestSvc(t)
	res, err := env.svc.SetupTwoFactor(context.Background(), env.id)
	require.NoError(t, err)
	require.NotEmpty(t, res.OtpauthURL)
	require.NotEmpty(t, res.ManualKey)
	require.Contains(t, res.QRSVG, "<svg")
	require.NotNil(t, env.repo.tf)
	require.False(t, env.repo.tf.Enabled(), "secret is pending, not enabled")
}

func TestTwoFactor_SetupRejectedWhenEnabled(t *testing.T) {
	env := newTestSvc(t)
	enabled := env.clk
	env.repo.tf = &TwoFactor{UserID: env.id.UserID, EnabledAt: &enabled}
	_, err := env.svc.SetupTwoFactor(context.Background(), env.id)
	assertAppErr(t, err, http.StatusConflict, "two_factor_already_enabled")
}

func TestTwoFactor_EnableSuccess(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	codes, err := env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})
	require.NoError(t, err)
	require.Len(t, codes, 10)
	require.True(t, env.repo.tf.Enabled())
	require.Len(t, env.repo.tf.RecoveryCodes, 10)
}

func TestTwoFactor_EnableWrongCode(t *testing.T) {
	env := newTestSvc(t)
	_, _ = setupAndCode(t, env)
	_, err := env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: "000000"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_2fa_code")
}

func TestTwoFactor_EnableNotPending(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: "123456"})
	assertAppErr(t, err, http.StatusConflict, "two_factor_not_pending")
}

func TestTwoFactor_DisableSuccess(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	_, err := env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})
	require.NoError(t, err)

	require.NoError(t, env.svc.DisableTwoFactor(context.Background(), env.id, Password2FARequest{Password: currentPassword}))
	require.Nil(t, env.repo.tf)
}

func TestTwoFactor_DisableWrongPassword(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	_, _ = env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})

	err := env.svc.DisableTwoFactor(context.Background(), env.id, Password2FARequest{Password: "wrong"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
	require.NotNil(t, env.repo.tf, "2FA stays enabled on failed re-auth")
}

func TestTwoFactor_DisableNotEnabled(t *testing.T) {
	env := newTestSvc(t)
	err := env.svc.DisableTwoFactor(context.Background(), env.id, Password2FARequest{Password: currentPassword})
	assertAppErr(t, err, http.StatusConflict, "two_factor_not_enabled")
}

func TestTwoFactor_RegenerateRecoveryCodes(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	_, _ = env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})
	first := env.repo.tf.RecoveryCodes

	codes, err := env.svc.RegenerateRecoveryCodes(context.Background(), env.id, Password2FARequest{Password: currentPassword})
	require.NoError(t, err)
	require.Len(t, codes, 10)
	require.NotEqual(t, first[0].Hash, env.repo.tf.RecoveryCodes[0].Hash, "old codes invalidated")
}

func TestTwoFactor_RegenerateWrongPassword(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	_, _ = env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})
	_, err := env.svc.RegenerateRecoveryCodes(context.Background(), env.id, Password2FARequest{Password: "wrong"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
}

func TestProfile_RecoveryRemainingAfterEnable(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	_, _ = env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})

	res, err := env.svc.GetProfile(context.Background(), env.id)
	require.NoError(t, err)
	require.True(t, res.TwoFactorEnabled)
	require.NotNil(t, res.RecoveryCodesRemaining)
	require.Equal(t, 10, *res.RecoveryCodesRemaining)
}

// --- Avatar ---

var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0x00}, 64)...)

func TestAvatar_UploadAndDelete(t *testing.T) {
	env := newTestSvc(t)
	url, err := env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Contains(t, url, "/api/files/users/")
	require.NotNil(t, env.repo.user.AvatarPath)

	require.NoError(t, env.svc.DeleteAvatar(context.Background(), env.id))
	require.Nil(t, env.repo.user.AvatarPath)
}

func TestAvatar_UnsupportedType(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader([]byte("not an image at all")))
	assertAppErr(t, err, http.StatusUnsupportedMediaType, "unsupported_media_type")
}

func TestAvatar_RateLimited(t *testing.T) {
	env := newTestSvc(t)
	var err error
	for i := 0; i < rlAvatar+1; i++ {
		_, err = env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader(pngBytes))
	}
	assertAppErr(t, err, http.StatusTooManyRequests, "rate_limited")
}

func TestAvatar_TooLarge(t *testing.T) {
	env := newTestSvc(t)
	// fakeSettings maxMB=10 → 10 MiB cap. Build 11 MiB starting with PNG magic.
	big := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0x01}, 11<<20)...)
	_, err := env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader(big))
	assertAppErr(t, err, http.StatusRequestEntityTooLarge, "payload_too_large")
}

// Storage Save failure → 500, avatar_path left untouched (no half-update).
func TestAvatar_SaveFailure_NoPathUpdate(t *testing.T) {
	store := newFailingStore()
	store.failSave = true
	env := newTestSvcStore(t, store)
	_, err := env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader(pngBytes))
	assertAppErr(t, err, http.StatusInternalServerError, "internal_server_error")
	require.Nil(t, env.repo.user.AvatarPath)
	require.Empty(t, store.saved)
}

// UpdateAvatarPath failure after a successful Save must roll back the new file
// (Delete the just-saved key) and return 500 with the path unchanged.
func TestAvatar_UpdatePathFailure_RollsBackFile(t *testing.T) {
	store := newFailingStore()
	env := newTestSvcStore(t, store)
	env.repo.avatarErr = errString("db down")
	_, err := env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader(pngBytes))
	assertAppErr(t, err, http.StatusInternalServerError, "internal_server_error")
	require.Nil(t, env.repo.user.AvatarPath)
	require.Len(t, store.deleted, 1) // rolled back
	require.Empty(t, store.saved)    // the rollback Delete removed it
}

// Deleting the previous avatar is best-effort: a failure there is logged but the
// upload still succeeds and the new path is committed.
func TestAvatar_OldDeleteFailure_StillSucceeds(t *testing.T) {
	store := newFailingStore()
	env := newTestSvcStore(t, store)
	old := "users/old/avatar-old.png"
	env.repo.user.AvatarPath = &old
	store.failDelete = true
	url, err := env.svc.UploadAvatar(context.Background(), env.id, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Contains(t, url, "/api/files/users/")
	require.NotNil(t, env.repo.user.AvatarPath)
	require.NotEqual(t, old, *env.repo.user.AvatarPath) // path advanced to the new key
	require.Contains(t, store.deleted, old)             // attempted (and failed) old delete
}

// DeleteAvatar best-effort file delete: even if the file delete fails, the path
// is cleared (NULL) and no error surfaces.
func TestAvatar_DeleteFileFailure_StillClearsPath(t *testing.T) {
	store := newFailingStore()
	env := newTestSvcStore(t, store)
	old := "users/old/avatar-old.png"
	env.repo.user.AvatarPath = &old
	store.failDelete = true
	require.NoError(t, env.svc.DeleteAvatar(context.Background(), env.id))
	require.Nil(t, env.repo.user.AvatarPath)
	require.Contains(t, store.deleted, old)
}
