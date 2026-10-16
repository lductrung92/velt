// Package recaptcha verifies Google reCAPTCHA v2 tokens server-side.
//
// Only the server may do this: verification needs the secret key, and the
// secret is the half that decides whether a token is genuine. A browser that
// could reach it could mint its own verdicts, which is the whole attack the
// widget exists to stop.
//
// The configuration lives in the settings registry (security.recaptcha_*), not
// in the environment, so an operator can turn protection on without a deploy.
package recaptcha

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/velt/backend/internal/modules/settings"
)

// verifyURL is Google's siteverify endpoint.
const verifyURL = "https://www.google.com/recaptcha/api/siteverify"

// timeout bounds one verification. A visitor is waiting on this, and Google
// being slow must not hold a request open indefinitely.
const timeout = 10 * time.Second

// ErrFailed means the token was absent, malformed or rejected. It carries no
// detail on purpose: telling a caller WHY their token failed is telling a bot
// how to pass.
var ErrFailed = errors.New("recaptcha verification failed")

// ErrMisconfigured means protection is switched on but no secret is stored.
//
// This is deliberately an error rather than a silent pass. "Enabled but
// unusable" is the state an operator most needs to hear about, and failing
// open would leave a form that looks protected and is not — the worst of both
// outcomes.
var ErrMisconfigured = errors.New("recaptcha is enabled but no secret key is set")

// SettingsPort is the slice of settings this package reads.
type SettingsPort interface {
	GetBool(ctx context.Context, key string) bool
	GetString(ctx context.Context, key string) string
	GetSecret(ctx context.Context, key string) string
}

// Verifier checks tokens against Google.
type Verifier struct {
	settings SettingsPort
	client   *http.Client
	endpoint string
}

// NewVerifier wires a verifier onto the settings registry.
func NewVerifier(s SettingsPort) *Verifier {
	return &Verifier{
		settings: s,
		client:   &http.Client{Timeout: timeout},
		endpoint: verifyURL,
	}
}

// Enabled reports whether protection is switched on.
func (v *Verifier) Enabled(ctx context.Context) bool {
	return v.settings.GetBool(ctx, settings.RecaptchaEnabled)
}

// Check verifies one token. It returns nil when protection is OFF — callers
// can therefore call it unconditionally, and whether a surface is protected
// stays a configuration question rather than a branch in every handler.
//
// remoteIP is optional; Google uses it as a weak extra signal and ignores a
// blank one.
func (v *Verifier) Check(ctx context.Context, token, remoteIP string) error {
	if !v.Enabled(ctx) {
		return nil
	}
	secret := strings.TrimSpace(v.settings.GetSecret(ctx, settings.RecaptchaSecret))
	if secret == "" {
		return ErrMisconfigured
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return ErrFailed
	}

	form := url.Values{"secret": {secret}, "response": {token}}
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.endpoint,
		strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("recaptcha request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := v.client.Do(req)
	if err != nil {
		// Google unreachable is NOT a pass. A form that accepts everything
		// whenever the network hiccups is a form an attacker can open at will
		// by making the network hiccup.
		return fmt.Errorf("recaptcha unreachable: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("recaptcha status %d", res.StatusCode)
	}

	var out struct {
		Success    bool     `json:"success"`
		ErrorCodes []string `json:"error-codes"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return fmt.Errorf("recaptcha decode: %w", err)
	}
	if !out.Success {
		return ErrFailed
	}
	return nil
}
