package sessions

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/modules/admin/shared/admintest"
	"github.com/velt/backend/internal/platform/crypto"
)

func TestIT_SessionListRevokeAndUserExists(t *testing.T) {
	pool := admintest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'adminit-%@x.test'`) // sessions cascade
	})

	var uid uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'IT') RETURNING id`,
		"adminit-"+uuid.NewString()+"@x.test").Scan(&uid))

	ok, err := repo.UserExists(ctx, uid)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = repo.UserExists(ctx, uuid.New())
	require.NoError(t, err)
	require.False(t, ok)

	var sid uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
		uid, crypto.HashToken(uuid.NewString()), time.Now().Add(time.Hour)).Scan(&sid))

	rows, total, err := repo.ListSessions(ctx, ListFilter{UserID: &uid, Active: true}, time.Now())
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, sid, rows[0].ID)

	owner, err := repo.GetSessionUser(ctx, sid)
	require.NoError(t, err)
	require.Equal(t, uid, owner)

	require.NoError(t, repo.RevokeSession(ctx, sid, time.Now()))
	_, total, err = repo.ListSessions(ctx, ListFilter{UserID: &uid, Active: true}, time.Now())
	require.NoError(t, err)
	require.Equal(t, 0, total)

	_, err = repo.GetSessionUser(ctx, uuid.New())
	require.ErrorIs(t, err, shared.ErrNotFound)
}
