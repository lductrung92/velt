package token

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type clock struct{ t time.Time }

func (c *clock) Now() time.Time { return c.t }

func newManager(now func() time.Time) *Manager {
	return NewManager("unit-test-secret", 15*time.Minute, 5*time.Minute, now)
}

func TestAccess_RoundTrip(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	uid := uuid.New()

	tok, err := m.NewAccess(uid, []string{"admin"}, []string{"users.read", "users.create"})
	require.NoError(t, err)

	gotUID, roles, perms, err := m.ParseAccess(tok)
	require.NoError(t, err)
	require.Equal(t, uid, gotUID)
	require.Equal(t, []string{"admin"}, roles)
	require.Equal(t, []string{"users.read", "users.create"}, perms)
}

func TestAccess_Expired(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	tok, err := m.NewAccess(uuid.New(), nil, nil)
	require.NoError(t, err)

	clk.t = clk.t.Add(16 * time.Minute) // past the 15m TTL
	_, _, _, err = m.ParseAccess(tok)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestAccess_WrongSecret(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	tok, err := m.NewAccess(uuid.New(), nil, nil)
	require.NoError(t, err)

	other := NewManager("a-different-secret", 15*time.Minute, 5*time.Minute, clk.Now)
	_, _, _, err = other.ParseAccess(tok)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestChallenge_RoundTrip(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	uid := uuid.New()

	tok, err := m.New2FAChallenge(uid)
	require.NoError(t, err)
	got, err := m.Parse2FAChallenge(tok)
	require.NoError(t, err)
	require.Equal(t, uid, got)
}

func TestChallenge_Expired(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	tok, _ := m.New2FAChallenge(uuid.New())

	clk.t = clk.t.Add(6 * time.Minute) // past 5m
	_, err := m.Parse2FAChallenge(tok)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestChallenge_RejectsAccessToken(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	access, _ := m.NewAccess(uuid.New(), nil, nil)

	// An access token must not be accepted as a 2FA challenge (purpose mismatch).
	_, err := m.Parse2FAChallenge(access)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestAccess_RejectsChallengeToken(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	m := newManager(clk.Now)
	challenge, _ := m.New2FAChallenge(uuid.New())

	// A half-authenticated 2FA challenge token must NOT be usable as an access
	// token (purpose claim mismatch) — otherwise it would bypass the 2FA step
	// for auth-only endpoints.
	_, _, _, err := m.ParseAccess(challenge)
	require.ErrorIs(t, err, ErrInvalidToken)
}
