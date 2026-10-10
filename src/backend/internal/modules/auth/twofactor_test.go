package auth

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
)

const testTOTPSecret = "JBSWY3DPEHPK3PXP" // base32, RFC 6238 example-style

func mustEncrypt(t *testing.T, env *testEnv, plaintext string) []byte {
	t.Helper()
	ct, err := env.aead.Encrypt([]byte(plaintext))
	require.NoError(t, err)
	return ct
}

func totpCode(t *testing.T, secret string, at time.Time) string {
	t.Helper()
	code, err := totp.GenerateCode(secret, at)
	require.NoError(t, err)
	return code
}

func enroll2FA(t *testing.T, env *testEnv, codes ...RecoveryCode) *User {
	t.Helper()
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	enabled := env.clk.Now()
	env.repo.twofactor[u.ID] = &TwoFactor{
		UserID:          u.ID,
		SecretEncrypted: mustEncrypt(t, env, testTOTPSecret),
		RecoveryCodes:   codes,
		EnabledAt:       &enabled,
	}
	return u
}

func TestVerifyTwoFactor_TOTP_Success(t *testing.T) {
	env := newTestEnv(t)
	u := enroll2FA(t, env)
	challenge, err := env.tokens.New2FAChallenge(u.ID)
	require.NoError(t, err)

	res, err := env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: totpCode(t, testTOTPSecret, env.clk.Now())},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.AccessToken)
	require.NotEmpty(t, res.RefreshToken)
	require.Equal(t, 1, env.repo.markSuccess)
	require.Equal(t, 1, env.repo.createSessions)
	require.NotNil(t, env.repo.twofactor[u.ID].LastUsedStep, "replay step should be recorded")
}

func TestVerifyTwoFactor_WrongCode(t *testing.T) {
	env := newTestEnv(t)
	u := enroll2FA(t, env)
	challenge, err := env.tokens.New2FAChallenge(u.ID)
	require.NoError(t, err)

	_, err = env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: "000000"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_2fa_code")
	require.Equal(t, 0, env.repo.markSuccess)
}

func TestVerifyTwoFactor_ExpiredChallenge(t *testing.T) {
	env := newTestEnv(t)
	u := enroll2FA(t, env)
	challenge, err := env.tokens.New2FAChallenge(u.ID)
	require.NoError(t, err)

	env.clk.Advance(6 * time.Minute) // challenge TTL is 5m

	_, err = env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: totpCode(t, testTOTPSecret, env.clk.Now())},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "challenge_expired")
}

func TestVerifyTwoFactor_TamperedChallenge(t *testing.T) {
	env := newTestEnv(t)
	enroll2FA(t, env)

	_, err := env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: "not-a-jwt", Code: "123456"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "challenge_expired")
}

func TestVerifyTwoFactor_RecoveryCode_Success(t *testing.T) {
	env := newTestEnv(t)
	raw := "recovery-code-one"
	u := enroll2FA(t, env, RecoveryCode{Hash: crypto.HashToken(raw), Used: false})
	challenge, err := env.tokens.New2FAChallenge(u.ID)
	require.NoError(t, err)

	res, err := env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: raw},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.AccessToken)
	require.True(t, env.repo.twofactor[u.ID].RecoveryCodes[0].Used, "recovery code must be marked used")
}

func TestVerifyTwoFactor_RecoveryCode_AlreadyUsed(t *testing.T) {
	env := newTestEnv(t)
	raw := "recovery-code-one"
	u := enroll2FA(t, env, RecoveryCode{Hash: crypto.HashToken(raw), Used: true})
	challenge, err := env.tokens.New2FAChallenge(u.ID)
	require.NoError(t, err)

	_, err = env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: raw},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_2fa_code")
}

func TestVerifyTwoFactor_TOTPReplayRejected(t *testing.T) {
	env := newTestEnv(t)
	u := enroll2FA(t, env)
	code := totpCode(t, testTOTPSecret, env.clk.Now())

	ch1, _ := env.tokens.New2FAChallenge(u.ID)
	_, err := env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: ch1, Code: code}, RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)

	// Same code, same time step → replay must be rejected.
	ch2, _ := env.tokens.New2FAChallenge(u.ID)
	_, err = env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: ch2, Code: code}, RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_2fa_code")
}

func TestVerifyTwoFactor_NotEnabledRow(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	env.repo.twofactor[u.ID] = &TwoFactor{UserID: u.ID, SecretEncrypted: mustEncrypt(t, env, testTOTPSecret)} // EnabledAt nil
	challenge, _ := env.tokens.New2FAChallenge(u.ID)

	_, err := env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: totpCode(t, testTOTPSecret, env.clk.Now())},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_2fa_code")
}

func TestVerifyTwoFactor_PerUserThrottleAcrossIPs(t *testing.T) {
	env := newTestEnv(t)
	u := enroll2FA(t, env)

	// Hammer wrong codes from a DIFFERENT IP each time so the per-IP limiter
	// never trips — only the per-user throttle (rl2FAPerUser=10) should.
	var lastErr error
	for i := 0; i < rl2FAPerUser+1; i++ {
		ch, _ := env.tokens.New2FAChallenge(u.ID)
		_, lastErr = env.svc.VerifyTwoFactor(context.Background(),
			TwoFactorVerifyRequest{ChallengeToken: ch, Code: "000000"},
			RequestMeta{IP: "10.0.0." + itoa(i)})
	}
	assertAppErr(t, lastErr, http.StatusTooManyRequests, "rate_limited")
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	return string(b)
}

func TestVerifyTwoFactor_UnknownUser(t *testing.T) {
	env := newTestEnv(t)
	challenge, _ := env.tokens.New2FAChallenge(uuid.New()) // no such user

	_, err := env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: challenge, Code: "123456"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "challenge_expired")
}
