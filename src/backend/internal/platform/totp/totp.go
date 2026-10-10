// Package totp provides the shared TOTP primitives used by both auth (verify at
// login) and account (enroll/manage): RFC 6238 verification with replay
// protection, secret + otpauth-URL generation, an SVG QR renderer, and
// single-use recovery codes. Keeping these here avoids duplicating the
// algorithm across modules.
package totp

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base32"
	"fmt"
	"strings"
	"time"

	"github.com/boombuler/barcode/qr"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/hotp"
	gototp "github.com/pquerna/otp/totp"
	"github.com/velt/backend/internal/platform/crypto"
)

// Period is the TOTP step length in seconds (RFC 6238 default).
const Period int64 = 30

// RecoveryCode is one stored 2FA recovery code (sha256 hash + single-use flag).
// It is the JSON shape persisted in two_factor_secrets.recovery_codes.
type RecoveryCode struct {
	Hash string `json:"hash"`
	Used bool   `json:"used"`
}

// Verify checks code against the TOTP steps [n-1, n, n+1] (±1 window), rejecting
// any step at or below lastStep (replay protection). It returns the matched
// step and true on success.
func Verify(secretB32, code string, lastStep *int64, now time.Time) (int64, bool) {
	current := now.Unix() / Period
	opts := hotp.ValidateOpts{Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1}
	for _, step := range []int64{current - 1, current, current + 1} {
		if step < 0 {
			continue
		}
		if lastStep != nil && step <= *lastStep {
			continue
		}
		gen, err := hotp.GenerateCodeCustom(secretB32, uint64(step), opts)
		if err != nil {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(gen), []byte(code)) == 1 {
			return step, true
		}
	}
	return 0, false
}

// GenerateSecret creates a new TOTP secret, returning the base32 secret and the
// otpauth:// provisioning URL (for the QR / manual entry).
func GenerateSecret(issuer, account string) (secret, url string, err error) {
	key, err := gototp.Generate(gototp.GenerateOpts{Issuer: issuer, AccountName: account})
	if err != nil {
		return "", "", fmt.Errorf("generate totp key: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

// GenerateRecoveryCodes returns n human-readable recovery codes (raw, shown to
// the user once) and their stored hashes.
func GenerateRecoveryCodes(n int) (raw []string, stored []RecoveryCode, err error) {
	raw = make([]string, 0, n)
	stored = make([]RecoveryCode, 0, n)
	for i := 0; i < n; i++ {
		code, err := randomRecoveryCode()
		if err != nil {
			return nil, nil, err
		}
		raw = append(raw, code)
		stored = append(stored, RecoveryCode{Hash: crypto.HashToken(code)})
	}
	return raw, stored, nil
}

func randomRecoveryCode() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("read random: %w", err)
	}
	s := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
	s = s[:10]
	return s[:5] + "-" + s[5:], nil
}

// QRCodeSVG renders the otpauth content as a self-contained SVG (one <rect> per
// dark module, 2-module quiet zone). No raster encoding / extra deps beyond the
// QR matrix already available via boombuler/barcode.
func QRCodeSVG(content string) (string, error) {
	code, err := qr.Encode(content, qr.M, qr.Auto)
	if err != nil {
		return "", fmt.Errorf("encode qr: %w", err)
	}
	b := code.Bounds()
	n := b.Dx() // module grid is square
	const scale, quiet = 4, 2
	size := (n + 2*quiet) * scale

	var sb strings.Builder
	fmt.Fprintf(&sb, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" shape-rendering="crispEdges">`,
		size, size, size, size)
	fmt.Fprintf(&sb, `<rect width="%d" height="%d" fill="#fff"/>`, size, size)
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			r, g, bl, _ := code.At(b.Min.X+x, b.Min.Y+y).RGBA()
			if r == 0 && g == 0 && bl == 0 {
				fmt.Fprintf(&sb, `<rect x="%d" y="%d" width="%d" height="%d"/>`,
					(x+quiet)*scale, (y+quiet)*scale, scale, scale)
			}
		}
	}
	sb.WriteString(`</svg>`)
	return sb.String(), nil
}
