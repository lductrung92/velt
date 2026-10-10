// Package crypto provides the security primitives used across the backend:
// argon2id password hashing, sha256 token hashing, secure random tokens, and
// AES-GCM authenticated encryption for secrets at rest.
package crypto

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2Params are the argon2id cost parameters. They are encoded into every
// hash so existing hashes keep verifying if defaults change later.
type argon2Params struct {
	memory      uint32 // KiB
	iterations  uint32
	parallelism uint8
	saltLen     uint32
	keyLen      uint32
}

var defaultArgon2 = argon2Params{
	memory:      64 * 1024, // 64 MiB
	iterations:  3,
	parallelism: 2,
	saltLen:     16,
	keyLen:      32,
}

// ErrInvalidHash is returned when a stored password hash cannot be parsed.
var ErrInvalidHash = errors.New("invalid password hash format")

// HashPassword hashes a plaintext password with argon2id, returning a PHC
// string ($argon2id$v=19$m=...,t=...,p=...$salt$hash). Plaintext is never
// stored or logged.
func HashPassword(plain string) (string, error) {
	p := defaultArgon2
	salt := make([]byte, p.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("read salt: %w", err)
	}
	hash := argon2.IDKey([]byte(plain), salt, p.iterations, p.memory, p.parallelism, p.keyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, p.memory, p.iterations, p.parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// VerifyPassword reports whether plain matches the encoded argon2id hash using
// a constant-time comparison.
func VerifyPassword(plain, encoded string) (bool, error) {
	p, salt, hash, err := decodeArgon2(encoded)
	if err != nil {
		return false, err
	}
	other := argon2.IDKey([]byte(plain), salt, p.iterations, p.memory, p.parallelism, p.keyLen)
	if subtle.ConstantTimeEq(int32(len(hash)), int32(len(other))) == 0 {
		return false, nil
	}
	return subtle.ConstantTimeCompare(hash, other) == 1, nil
}

func decodeArgon2(encoded string) (argon2Params, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return argon2Params{}, nil, nil, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return argon2Params{}, nil, nil, ErrInvalidHash
	}
	var p argon2Params
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallelism); err != nil {
		return argon2Params{}, nil, nil, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return argon2Params{}, nil, nil, ErrInvalidHash
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return argon2Params{}, nil, nil, ErrInvalidHash
	}
	p.saltLen = uint32(len(salt))
	p.keyLen = uint32(len(hash))
	return p, salt, hash, nil
}
