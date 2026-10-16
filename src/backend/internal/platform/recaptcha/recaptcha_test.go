package recaptcha

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/settings"
)

type fakeSettings struct {
	enabled bool
	secret  string
	siteKey string
}

func (f fakeSettings) GetBool(_ context.Context, key string) bool {
	return key == settings.RecaptchaEnabled && f.enabled
}
func (f fakeSettings) GetString(_ context.Context, key string) string {
	if key == settings.RecaptchaSiteKey {
		return f.siteKey
	}
	return ""
}
func (f fakeSettings) GetSecret(_ context.Context, key string) string {
	if key == settings.RecaptchaSecret {
		return f.secret
	}
	return ""
}

// google stands in for siteverify, and records what it was sent.
func google(t *testing.T, body string) (*httptest.Server, *url.Values) {
	t.Helper()
	seen := &url.Values{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		*seen = r.PostForm
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, seen
}

func verifier(s fakeSettings, endpoint string) *Verifier {
	v := NewVerifier(s)
	if endpoint != "" {
		v.endpoint = endpoint
	}
	return v
}

func TestCheckPassesWhenProtectionIsOff(t *testing.T) {
	// Callers invoke Check unconditionally, so "off" has to be a pass rather
	// than something every handler has to branch around.
	v := verifier(fakeSettings{enabled: false}, "")
	require.NoError(t, v.Check(context.Background(), "", ""))
}

func TestCheckRefusesWhenEnabledWithoutASecret(t *testing.T) {
	// The state an operator most needs told about: the form looks protected
	// and would accept anything. Failing open here is worse than failing.
	v := verifier(fakeSettings{enabled: true, secret: "  "}, "")
	err := v.Check(context.Background(), "token", "")
	require.ErrorIs(t, err, ErrMisconfigured)
}

func TestCheckRefusesAnEmptyToken(t *testing.T) {
	srv, _ := google(t, `{"success":true}`)
	v := verifier(fakeSettings{enabled: true, secret: "s3cr3t"}, srv.URL)
	require.ErrorIs(t, v.Check(context.Background(), "   ", ""), ErrFailed)
}

func TestCheckSendsTheSecretAndTokenAndAcceptsSuccess(t *testing.T) {
	srv, seen := google(t, `{"success":true}`)
	v := verifier(fakeSettings{enabled: true, secret: "s3cr3t"}, srv.URL)

	require.NoError(t, v.Check(context.Background(), "tok-abc", "203.0.113.9"))
	require.Equal(t, "s3cr3t", seen.Get("secret"))
	require.Equal(t, "tok-abc", seen.Get("response"))
	require.Equal(t, "203.0.113.9", seen.Get("remoteip"))
}

func TestCheckOmitsTheAddressWhenThereIsNone(t *testing.T) {
	srv, seen := google(t, `{"success":true}`)
	v := verifier(fakeSettings{enabled: true, secret: "s3cr3t"}, srv.URL)

	require.NoError(t, v.Check(context.Background(), "tok", ""))
	require.False(t, seen.Has("remoteip"), "a blank address must not be sent as empty")
}

func TestCheckRejectsAFailedVerdict(t *testing.T) {
	srv, _ := google(t, `{"success":false,"error-codes":["invalid-input-response"]}`)
	v := verifier(fakeSettings{enabled: true, secret: "s3cr3t"}, srv.URL)

	err := v.Check(context.Background(), "tok", "")
	require.ErrorIs(t, err, ErrFailed)
	require.NotContains(t, err.Error(), "invalid-input-response",
		"the reason must not travel back to the caller")
}

func TestCheckDoesNotPassWhenGoogleIsUnreachable(t *testing.T) {
	// The failure mode worth guarding: a form that accepts everything whenever
	// the network hiccups can be opened at will by making it hiccup.
	v := verifier(fakeSettings{enabled: true, secret: "s3cr3t"}, "http://127.0.0.1:1/verify")
	err := v.Check(context.Background(), "tok", "")
	require.Error(t, err)
	require.False(t, errors.Is(err, ErrFailed), "a network fault is not a verdict")
}

func TestCheckDoesNotPassOnANonOKStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(srv.Close)
	v := verifier(fakeSettings{enabled: true, secret: "s3cr3t"}, srv.URL)
	require.Error(t, v.Check(context.Background(), "tok", ""))
}
