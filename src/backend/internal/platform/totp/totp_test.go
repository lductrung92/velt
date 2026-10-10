package totp

import (
	"strings"
	"testing"
	"time"

	gototp "github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
)

func TestVerify_ValidAndReplay(t *testing.T) {
	secret, url, err := GenerateSecret("velt", "user@example.com")
	require.NoError(t, err)
	require.NotEmpty(t, secret)
	require.True(t, strings.HasPrefix(url, "otpauth://"))

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	code, err := gototp.GenerateCode(secret, now)
	require.NoError(t, err)

	step, ok := Verify(secret, code, nil, now)
	require.True(t, ok)

	// Replay: same code, lastStep = matched step → rejected.
	_, ok = Verify(secret, code, &step, now)
	require.False(t, ok, "replay must be rejected")
}

func TestVerify_WrongCode(t *testing.T) {
	secret, _, _ := GenerateSecret("velt", "user@example.com")
	_, ok := Verify(secret, "000000", nil, time.Now())
	require.False(t, ok)
}

func TestVerify_Window(t *testing.T) {
	secret, _, _ := GenerateSecret("velt", "user@example.com")
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	// A code from the previous step is accepted within the ±1 window.
	prev, err := gototp.GenerateCode(secret, now.Add(-time.Duration(Period)*time.Second))
	require.NoError(t, err)
	_, ok := Verify(secret, prev, nil, now)
	require.True(t, ok)
}

func TestGenerateRecoveryCodes(t *testing.T) {
	raw, stored, err := GenerateRecoveryCodes(10)
	require.NoError(t, err)
	require.Len(t, raw, 10)
	require.Len(t, stored, 10)

	seen := map[string]bool{}
	for i, code := range raw {
		require.False(t, seen[code], "duplicate recovery code")
		seen[code] = true
		require.Equal(t, crypto.HashToken(code), stored[i].Hash)
		require.False(t, stored[i].Used)
		require.Contains(t, code, "-") // human-readable grouping
	}
}

func TestQRCodeSVG(t *testing.T) {
	svg, err := QRCodeSVG("otpauth://totp/velt:user@example.com?secret=ABCDEFGHIJ&issuer=velt")
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(svg, "<svg"))
	require.True(t, strings.HasSuffix(svg, "</svg>"))
	require.Contains(t, svg, "<rect")
}
