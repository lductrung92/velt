package settings

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/apperr"
)

func TestGetAll_DefaultsAndMasking(t *testing.T) {
	env := newTestSvc(t)
	view, err := env.svc.GetAll(context.Background(), adminID())
	require.NoError(t, err)

	// Non-secret default surfaces.
	appName := findEntry(t, view, "general", "app.name")
	require.Equal(t, "Velt", appName["value"])
	require.Equal(t, true, appName["is_public"])

	// enum carries allowed_values.
	locale := findEntry(t, view, "general", "app.default_locale")
	require.Equal(t, []string{"vi", "en"}, locale["allowed_values"])

	// Secret is masked: is_set only, never value.
	pw := findEntry(t, view, "email", "mail.smtp_password")
	require.Equal(t, false, pw["is_set"])
	_, hasValue := pw["value"]
	require.False(t, hasValue, "secret must never expose value")
}

func TestGetAll_RequiresRead(t *testing.T) {
	env := newTestSvc(t)
	none := readerID()
	none.Permissions = nil
	_, err := env.svc.GetAll(context.Background(), none)
	assertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestUpdate_SetNonSecret(t *testing.T) {
	env := newTestSvc(t)
	view, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.name": raw(`"MyApp"`),
	})
	require.NoError(t, err)
	require.Equal(t, "MyApp", findEntry(t, view, "general", "app.name")["value"])
	require.Equal(t, 1, env.repo.applyCount)
	require.GreaterOrEqual(t, env.cache.invalidated, 1, "cache must be invalidated after commit")
}

func TestUpdate_EmptyStringIsValidNotDelete(t *testing.T) {
	env := newTestSvc(t)
	// Pre-set a logo, then set "" — must store "", not revert to default.
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.logo_url": raw(`"https://x.test/logo.png"`),
	})
	require.NoError(t, err)
	view, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.logo_url": raw(`""`),
	})
	require.NoError(t, err)
	require.Equal(t, "", findEntry(t, view, "general", "app.logo_url")["value"])
	_, stored := env.repo.snap["app.logo_url"]
	require.True(t, stored, `"" must be stored as a value, not deleted`)
}

func TestUpdate_NullDeletes(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.name": raw(`"Temp"`),
	})
	require.NoError(t, err)
	view, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.name": raw(`null`),
	})
	require.NoError(t, err)
	require.Equal(t, "Velt", findEntry(t, view, "general", "app.name")["value"], "null reverts to default")
	_, stored := env.repo.snap["app.name"]
	require.False(t, stored)
}

func TestUpdate_SecretEncryptedAndMasked(t *testing.T) {
	env := newTestSvc(t)
	view, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_password": raw(`"s3cr3t-password"`),
	})
	require.NoError(t, err)
	require.Equal(t, true, findEntry(t, view, "email", "mail.smtp_password")["is_set"])

	// Stored encrypted (not plaintext) and decrypts back via the service.
	row := env.repo.snap["mail.smtp_password"]
	require.NotEmpty(t, row.Encrypted)
	require.Nil(t, row.Value)
	require.NotContains(t, string(row.Encrypted), "s3cr3t-password")
	require.Equal(t, "s3cr3t-password", env.svc.GetSecret(context.Background(), "mail.smtp_password"))
}

func TestUpdate_SecretNullRemoves(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_password": raw(`"to-be-removed"`),
	})
	require.NoError(t, err)
	view, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_password": raw(`null`),
	})
	require.NoError(t, err)
	require.Equal(t, false, findEntry(t, view, "email", "mail.smtp_password")["is_set"])
}

func TestUpdate_UnknownKey(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"bogus.key": raw(`1`),
	})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "unknown_setting_key")
	require.Equal(t, 0, env.repo.applyCount)
}

func TestUpdate_ValidationErrors(t *testing.T) {
	env := newTestSvc(t)
	cases := map[string]json.RawMessage{
		"mail.smtp_port":     raw(`70000`),       // out of range
		"app.default_locale": raw(`"fr"`),        // not in enum
		"app.logo_url":       raw(`"not a url"`), // bad url format
	}
	for key, val := range cases {
		_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{key: val})
		assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
	}
	require.Equal(t, 0, env.repo.applyCount)
}

func TestUpdate_CrossKey_S3RequiresBucket(t *testing.T) {
	env := newTestSvc(t)
	// driver=s3 with no bucket anywhere → 422 on merged state.
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"storage.driver": raw(`"s3"`),
	})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")

	// driver=s3 with bucket but missing endpoint/access_key → still 422.
	_, err = env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"storage.driver":    raw(`"s3"`),
		"storage.s3_bucket": raw(`"my-bucket"`),
	})
	assertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")

	// driver=s3 + bucket + endpoint + access_key together → ok.
	_, err = env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"storage.driver":        raw(`"s3"`),
		"storage.s3_bucket":     raw(`"my-bucket"`),
		"storage.s3_endpoint":   raw(`"http://127.0.0.1:8333"`),
		"storage.s3_access_key": raw(`"access-key"`),
	})
	require.NoError(t, err)
}

func TestUpdate_CrossKey_UsesMergedStateFromDB(t *testing.T) {
	env := newTestSvc(t)
	// Bucket/endpoint/access_key already stored; changing only driver=s3 must
	// pass thanks to the merged DB state.
	env.repo.snap["storage.s3_bucket"] = storedValue{Value: raw(`"existing-bucket"`)}
	env.repo.snap["storage.s3_endpoint"] = storedValue{Value: raw(`"http://127.0.0.1:8333"`)}
	env.repo.snap["storage.s3_access_key"] = storedValue{Value: raw(`"existing-key"`)}
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"storage.driver": raw(`"s3"`),
	})
	require.NoError(t, err)
}

func TestUpdate_RequiresManage(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.Update(context.Background(), readerID(), map[string]json.RawMessage{
		"app.name": raw(`"X"`),
	})
	assertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestGetPublic_OnlyPublicKeys(t *testing.T) {
	env := newTestSvc(t)
	out, err := env.svc.GetPublic(context.Background())
	require.NoError(t, err)
	require.Equal(t, "Velt", out["app.name"])
	require.Contains(t, out, "app.logo_url")
	require.Contains(t, out, "app.default_locale")
	require.NotContains(t, out, "mail.smtp_host")
	require.NotContains(t, out, "mail.smtp_password")
}

func TestTestEmail_NotConfigured(t *testing.T) {
	env := newTestSvc(t)
	err := env.svc.TestEmail(context.Background(), adminID(), "to@x.test")
	assertAppErr(t, err, http.StatusBadGateway, "smtp_test_failed")
	ae, _ := apperr.As(err)
	require.Equal(t, "not_configured", ae.Details["reason"])
	require.Equal(t, 0, env.tester.calls, "must not probe when host unset")
}

func TestTestEmail_Success(t *testing.T) {
	env := newTestSvc(t)
	env.repo.snap["mail.smtp_host"] = storedValue{Value: raw(`"smtp.example.com"`)}
	require.NoError(t, env.svc.TestEmail(context.Background(), adminID(), "to@x.test"))
	require.Equal(t, 1, env.tester.calls)
	require.Equal(t, "to@x.test", env.tester.lastTo)
	require.Equal(t, "smtp.example.com", env.tester.lastCfg.Host)
	require.Equal(t, 587, env.tester.lastCfg.Port) // registry default
}

func TestTestEmail_ReasonPropagated(t *testing.T) {
	env := newTestSvc(t)
	env.repo.snap["mail.smtp_host"] = storedValue{Value: raw(`"smtp.example.com"`)}
	env.tester.reason = "auth_failed"
	err := env.svc.TestEmail(context.Background(), adminID(), "to@x.test")
	assertAppErr(t, err, http.StatusBadGateway, "smtp_test_failed")
	ae, _ := apperr.As(err)
	require.Equal(t, "auth_failed", ae.Details["reason"])
}

func TestTestEmail_RequiresManage(t *testing.T) {
	env := newTestSvc(t)
	err := env.svc.TestEmail(context.Background(), readerID(), "to@x.test")
	assertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestTestEmail_LimiterError_FailsClosed(t *testing.T) {
	// S1: limiter outage must deny (not silently send unbounded probes).
	env := newTestSvcWith(t, errLimiter{})
	env.repo.snap["mail.smtp_host"] = storedValue{Value: raw(`"smtp.example.com"`)}
	err := env.svc.TestEmail(context.Background(), adminID(), "to@x.test")
	assertAppErr(t, err, http.StatusTooManyRequests, "rate_limited")
	require.Equal(t, 0, env.tester.calls, "must not probe when limiter is down")
}

func TestUpdate_SecretEmptyTreatedAsUnset(t *testing.T) {
	// S4: setting a secret to "" must NOT report is_set=true.
	env := newTestSvc(t)
	// First set a real secret, then blank it with "".
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_password": raw(`"real-secret"`),
	})
	require.NoError(t, err)
	view, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_password": raw(`""`),
	})
	require.NoError(t, err)
	require.Equal(t, false, findEntry(t, view, "email", "mail.smtp_password")["is_set"])
	_, stored := env.repo.snap["mail.smtp_password"]
	require.False(t, stored, `empty secret must be unset, not stored as empty ciphertext`)
}

func TestTestEmail_RateLimited(t *testing.T) {
	env := newTestSvc(t)
	env.repo.snap["mail.smtp_host"] = storedValue{Value: raw(`"smtp.example.com"`)}
	id := adminID()
	var err error
	for i := 0; i < rlTestEmailPerUser+1; i++ {
		err = env.svc.TestEmail(context.Background(), id, "to@x.test")
	}
	assertAppErr(t, err, http.StatusTooManyRequests, "rate_limited")
}
