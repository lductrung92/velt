package crypto

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPassword_RoundTrip(t *testing.T) {
	hash, err := HashPassword("correct-horse-battery")
	require.NoError(t, err)
	require.Contains(t, hash, "$argon2id$")

	ok, err := VerifyPassword("correct-horse-battery", hash)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = VerifyPassword("wrong-password", hash)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestPassword_DistinctSalts(t *testing.T) {
	a, err := HashPassword("same-password")
	require.NoError(t, err)
	b, err := HashPassword("same-password")
	require.NoError(t, err)
	require.NotEqual(t, a, b, "salts must differ → hashes differ")
}

func TestPassword_InvalidHashFormat(t *testing.T) {
	_, err := VerifyPassword("x", "not-a-phc-string")
	require.ErrorIs(t, err, ErrInvalidHash)
}

func TestAEAD_RoundTrip(t *testing.T) {
	key := bytes.Repeat([]byte{0x07}, 32)
	a, err := NewAEAD(key)
	require.NoError(t, err)

	ct, err := a.Encrypt([]byte("top-secret-totp"))
	require.NoError(t, err)

	pt, err := a.Decrypt(ct)
	require.NoError(t, err)
	require.Equal(t, "top-secret-totp", string(pt))
}

func TestAEAD_TamperedCiphertextFails(t *testing.T) {
	a, _ := NewAEAD(bytes.Repeat([]byte{0x07}, 32))
	ct, _ := a.Encrypt([]byte("secret"))
	ct[len(ct)-1] ^= 0xff // flip a tag byte

	_, err := a.Decrypt(ct)
	require.ErrorIs(t, err, ErrCiphertext)
}

func TestAEAD_DifferentKeyFails(t *testing.T) {
	a, _ := NewAEAD(bytes.Repeat([]byte{0x07}, 32))
	ct, _ := a.Encrypt([]byte("secret"))

	b, _ := NewAEAD(bytes.Repeat([]byte{0x08}, 32))
	_, err := b.Decrypt(ct)
	require.ErrorIs(t, err, ErrCiphertext)
}

func TestAEAD_BadKeySize(t *testing.T) {
	_, err := NewAEAD([]byte("too-short"))
	require.ErrorIs(t, err, ErrInvalidKey)
}

func TestAEAD_TooShortBlob(t *testing.T) {
	a, _ := NewAEAD(bytes.Repeat([]byte{0x07}, 32))
	_, err := a.Decrypt([]byte{0x00})
	require.ErrorIs(t, err, ErrCiphertext)
}

func TestParseKey(t *testing.T) {
	hex64 := "0000000000000000000000000000000000000000000000000000000000000000"
	k, err := ParseKey(hex64)
	require.NoError(t, err)
	require.Len(t, k, 32)

	_, err = ParseKey("short")
	require.ErrorIs(t, err, ErrInvalidKey)
}

func TestHashToken(t *testing.T) {
	h1 := HashToken("token-abc")
	require.Len(t, h1, 64) // sha256 hex
	require.Equal(t, h1, HashToken("token-abc"))
	require.NotEqual(t, h1, HashToken("token-xyz"))
	require.True(t, EqualTokenHash("token-abc", h1))
	require.False(t, EqualTokenHash("token-xyz", h1))
}

func TestRandomToken(t *testing.T) {
	a, err := RandomToken(32)
	require.NoError(t, err)
	require.NotEmpty(t, a)
	b, err := RandomToken(32)
	require.NoError(t, err)
	require.NotEqual(t, a, b)
}
