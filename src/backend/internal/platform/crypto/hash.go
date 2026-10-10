package crypto

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// HashToken returns the lowercase hex sha256 of a raw token. Refresh tokens and
// password-reset tokens are stored only as this hash; the raw value exists in
// memory just long enough to hand to the client.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// EqualTokenHash compares a raw token against a stored hash in constant time.
func EqualTokenHash(raw, storedHash string) bool {
	return subtle.ConstantTimeCompare([]byte(HashToken(raw)), []byte(storedHash)) == 1
}

// RandomToken returns a URL-safe random token with nBytes of entropy
// (≥32 for refresh/reset tokens → ≥256-bit).
func RandomToken(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("read random: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
