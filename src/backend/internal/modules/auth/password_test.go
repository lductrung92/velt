package auth

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
)

func addResetToken(t *testing.T, env *testEnv, userID uuid.UUID, raw string, expiresAt time.Time, used *time.Time) {
	t.Helper()
	require.NoError(t, env.repo.CreateResetToken(context.Background(), &ResetToken{
		ID:        uuid.New(),
		UserID:    userID,
		TokenHash: crypto.HashToken(raw),
		ExpiresAt: expiresAt,
		UsedAt:    used,
		CreatedAt: env.clk.Now(),
	}))
}

func TestForgotPassword_ExistingUser_CreatesTokenAndMails(t *testing.T) {
	env := newTestEnv(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "alice@example.com"}, RequestMeta{IP: "1.2.3.4"}))
	require.Equal(t, 1, env.mailer.sent)
	require.Len(t, env.repo.resetTokens, 1)
	require.Contains(t, env.mailer.lastLink, "token=")
	require.Equal(t, "alice@example.com", env.mailer.lastTo)
	// F7: the requesting IP is recorded for audit.
	for _, tok := range env.repo.resetTokens {
		require.NotNil(t, tok.RequestedIP)
		require.Equal(t, "1.2.3.4", *tok.RequestedIP)
	}
}

func TestForgotPassword_UnknownEmail_NoTokenNoMail(t *testing.T) {
	env := newTestEnv(t)
	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "ghost@example.com"}, RequestMeta{IP: "1.2.3.4"}))
	require.Equal(t, 0, env.mailer.sent)
	require.Empty(t, env.repo.resetTokens)
}

func TestForgotPassword_DisabledUser_NoToken(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	u.Status = statusDisabled
	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "alice@example.com"}, RequestMeta{IP: "1.2.3.4"}))
	require.Equal(t, 0, env.mailer.sent)
	require.Empty(t, env.repo.resetTokens)
}

func TestForgotPassword_InvalidatesPriorTokens(t *testing.T) {
	env := newTestEnv(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "alice@example.com"}, RequestMeta{IP: "1.2.3.4"}))
	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "alice@example.com"}, RequestMeta{IP: "1.2.3.4"}))

	used := 0
	for _, tok := range env.repo.resetTokens {
		if tok.UsedAt != nil {
			used++
		}
	}
	require.Equal(t, 1, used, "issuing a new token invalidates the prior unused one")
}

func TestResetPassword_Success(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "old-password-12345")
	addResetToken(t, env, u.ID, "raw-reset-token", env.clk.Now().Add(20*time.Minute), nil)

	require.NoError(t, env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "brand-new-password"},
		RequestMeta{IP: "1.2.3.4"}))
	require.Equal(t, 1, env.repo.resetPwCalls)

	ok, err := crypto.VerifyPassword("brand-new-password", env.repo.users[u.ID].PasswordHash)
	require.NoError(t, err)
	require.True(t, ok)
}

func TestResetPassword_SingleUse(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "old-password-12345")
	addResetToken(t, env, u.ID, "raw-reset-token", env.clk.Now().Add(20*time.Minute), nil)

	require.NoError(t, env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "brand-new-password"},
		RequestMeta{IP: "1.2.3.4"}))
	// Re-using the now-consumed token must fail.
	err := env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "another-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_or_expired_token")
}

func TestResetPassword_InvalidToken(t *testing.T) {
	env := newTestEnv(t)
	err := env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "does-not-exist", NewPassword: "brand-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_or_expired_token")
}

func TestResetPassword_ExpiredToken(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "old-password-12345")
	addResetToken(t, env, u.ID, "raw-reset-token", env.clk.Now().Add(-time.Minute), nil)

	err := env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "brand-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_or_expired_token")
}

func TestResetPassword_DisabledUser_NoReveal(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "old-password-12345")
	u.Status = statusDisabled
	addResetToken(t, env, u.ID, "raw-reset-token", env.clk.Now().Add(20*time.Minute), nil)

	err := env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "brand-new-password"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_or_expired_token")
}

func TestResetPassword_TooShort(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "old-password-12345")
	addResetToken(t, env, u.ID, "raw-reset-token", env.clk.Now().Add(20*time.Minute), nil)

	err := env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "short"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestResetPassword_TooCommon(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "old-password-12345")
	addResetToken(t, env, u.ID, "raw-reset-token", env.clk.Now().Add(20*time.Minute), nil)

	err := env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-reset-token", NewPassword: "letmein12345"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}
