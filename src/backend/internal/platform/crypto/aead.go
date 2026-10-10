package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
)

// AEAD performs AES-256-GCM authenticated encryption for secrets at rest
// (e.g. the TOTP secret). The output layout is nonce || ciphertext-with-tag.
type AEAD struct {
	gcm cipher.AEAD
}

// ErrInvalidKey is returned when the encryption key is not 32 bytes.
var ErrInvalidKey = errors.New("encryption key must be 32 bytes (AES-256)")

// ErrCiphertext is returned when a ciphertext blob is malformed or fails the
// authentication check.
var ErrCiphertext = errors.New("invalid or corrupt ciphertext")

// ParseKey decodes a 32-byte key from a hex (64 chars) or standard-base64
// string.
func ParseKey(s string) ([]byte, error) {
	if b, err := hex.DecodeString(s); err == nil && len(b) == 32 {
		return b, nil
	}
	if b, err := base64.StdEncoding.DecodeString(s); err == nil && len(b) == 32 {
		return b, nil
	}
	return nil, ErrInvalidKey
}

// NewAEAD builds an AES-256-GCM AEAD from a 32-byte key.
func NewAEAD(key []byte) (*AEAD, error) {
	if len(key) != 32 {
		return nil, ErrInvalidKey
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}
	return &AEAD{gcm: gcm}, nil
}

// Encrypt seals plaintext, prefixing a fresh random nonce.
func (a *AEAD) Encrypt(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, a.gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("read nonce: %w", err)
	}
	return a.gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt opens a nonce-prefixed ciphertext blob produced by Encrypt.
func (a *AEAD) Decrypt(blob []byte) ([]byte, error) {
	ns := a.gcm.NonceSize()
	if len(blob) < ns {
		return nil, ErrCiphertext
	}
	nonce, ct := blob[:ns], blob[ns:]
	plaintext, err := a.gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, ErrCiphertext
	}
	return plaintext, nil
}
