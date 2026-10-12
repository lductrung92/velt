package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/ai/shared"
)

// tokenPrefix makes a leaked credential recognisable in a log or a paste, so
// it can be revoked instead of puzzled over.
const tokenPrefix = "zkt_mcp_"

// tokenTTL is how long a new credential stays valid. Long enough that an agent
// config is not a chore to maintain, short enough that a leak nobody noticed
// stops working on its own. Tokens issued before expiry existed have a NULL
// expires_at and keep working — see migration 0033.
const tokenTTL = 90 * 24 * time.Hour

// Token is an issued credential, without the secret.
type Token struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	Label      string     `json:"label"`
	Hint       string     `json:"hint"`
	LastUsedAt *time.Time `json:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
	ExpiresAt  *time.Time `json:"expires_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// IssuedToken is the one and only time the plaintext exists outside the client.
type IssuedToken struct {
	Token
	Secret string `json:"secret"`
}

// TokenStore persists MCP credentials.
type TokenStore struct {
	pool *pgxpool.Pool
}

// NewTokenStore builds the credential store.
func NewTokenStore(pool *pgxpool.Pool) *TokenStore { return &TokenStore{pool: pool} }

// hashToken is a plain SHA-256. That is right here and would be wrong for a
// password: this secret is 32 bytes of CSPRNG output, so there is no dictionary
// to attack and nothing for a slow KDF to buy.
func hashToken(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// Issue mints a credential for a user and returns the plaintext once.
func (s *TokenStore) Issue(ctx context.Context, userID uuid.UUID, label string) (IssuedToken, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return IssuedToken{}, shared.Wrap("issue mcp token: entropy", err)
	}
	secret := tokenPrefix + hex.EncodeToString(raw)
	hint := secret[:len(tokenPrefix)+6]

	var t Token
	err := s.pool.QueryRow(ctx, `
		INSERT INTO mcp_tokens (user_id, token_hash, token_hint, label, expires_at)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, user_id, label, token_hint, last_used_at, revoked_at, expires_at, created_at`,
		userID, hashToken(secret), hint, strings.TrimSpace(label), time.Now().Add(tokenTTL)).
		Scan(&t.ID, &t.UserID, &t.Label, &t.Hint, &t.LastUsedAt, &t.RevokedAt, &t.ExpiresAt, &t.CreatedAt)
	if err != nil {
		return IssuedToken{}, shared.Wrap("issue mcp token", err)
	}
	return IssuedToken{Token: t, Secret: secret}, nil
}

// Resolve turns a presented secret into the user it belongs to.
func (s *TokenStore) Resolve(ctx context.Context, secret string) (uuid.UUID, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return uuid.Nil, shared.ErrNotFound
	}
	var id, userID uuid.UUID
	// Expiry is checked in the same statement as revocation: an expired token
	// must be exactly as unusable as a revoked one, with no window where a
	// second query could be skipped.
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id FROM mcp_tokens
		 WHERE token_hash = $1
		   AND revoked_at IS NULL
		   AND (expires_at IS NULL OR expires_at > now())`, hashToken(secret)).Scan(&id, &userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, shared.ErrNotFound
		}
		return uuid.Nil, shared.Wrap("resolve mcp token", err)
	}
	// Best-effort: a usage stamp is worth having but never worth failing a call.
	_, _ = s.pool.Exec(ctx, `UPDATE mcp_tokens SET last_used_at = now() WHERE id = $1`, id)
	return userID, nil
}

// List returns a user's credentials, secrets excluded.
func (s *TokenStore) List(ctx context.Context, userID uuid.UUID) ([]Token, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, label, token_hint, last_used_at, revoked_at, expires_at, created_at
		  FROM mcp_tokens WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, shared.Wrap("list mcp tokens", err)
	}
	defer rows.Close()

	out := []Token{}
	for rows.Next() {
		var t Token
		if err := rows.Scan(&t.ID, &t.UserID, &t.Label, &t.Hint,
			&t.LastUsedAt, &t.RevokedAt, &t.ExpiresAt, &t.CreatedAt); err != nil {
			return nil, shared.Wrap("scan mcp token", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Revoke disables a credential. Scoped to the owner so one person cannot revoke
// another's by guessing an id.
func (s *TokenStore) Revoke(ctx context.Context, userID, tokenID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE mcp_tokens SET revoked_at = now()
		  WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, tokenID, userID)
	if err != nil {
		return shared.Wrap("revoke mcp token", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrNotFound
	}
	return nil
}
