// Package admintest provides shared test helpers for the admin feature packages:
// identity builders, an AppError assertion, and a lazy integration-test pool.
// Imported only from _test.go files.
package admintest

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

// FakeSpine is an in-memory shared.SpineRepo for feature service unit tests. Set
// only the fields a test needs; the rest return empty.
type FakeSpine struct {
	Roles      map[uuid.UUID]*shared.Role
	RolePerms  map[uuid.UUID][]string
	PermCodes  map[uuid.UUID]string
	ActorPerms map[uuid.UUID]map[string]bool
	SuperAdmin map[uuid.UUID]bool
	SuperIDs   []uuid.UUID
}

// NewFakeSpine builds an empty FakeSpine with initialized maps.
func NewFakeSpine() *FakeSpine {
	return &FakeSpine{
		Roles: map[uuid.UUID]*shared.Role{}, RolePerms: map[uuid.UUID][]string{},
		PermCodes: map[uuid.UUID]string{}, ActorPerms: map[uuid.UUID]map[string]bool{},
		SuperAdmin: map[uuid.UUID]bool{},
	}
}

// GetRole implements shared.SpineRepo.
func (f *FakeSpine) GetRole(_ context.Context, id uuid.UUID) (*shared.Role, error) {
	if r, ok := f.Roles[id]; ok {
		return r, nil
	}
	return nil, shared.ErrNotFound
}

// GetRoleByCode implements shared.SpineRepo.
func (f *FakeSpine) GetRoleByCode(_ context.Context, code string) (*shared.Role, error) {
	for _, r := range f.Roles {
		if r.Code == code {
			return r, nil
		}
	}
	return nil, shared.ErrNotFound
}

// RolePermissionCodes implements shared.SpineRepo.
func (f *FakeSpine) RolePermissionCodes(_ context.Context, roleID uuid.UUID) ([]string, error) {
	return f.RolePerms[roleID], nil
}

// PermissionCodesByIDs implements shared.SpineRepo.
func (f *FakeSpine) PermissionCodesByIDs(_ context.Context, ids []uuid.UUID) ([]string, error) {
	out := []string{}
	for _, id := range ids {
		if c, ok := f.PermCodes[id]; ok {
			out = append(out, c)
		}
	}
	return out, nil
}

// ActorEffectivePermissions implements shared.SpineRepo.
func (f *FakeSpine) ActorEffectivePermissions(_ context.Context, actorID uuid.UUID) (map[string]bool, error) {
	if s, ok := f.ActorPerms[actorID]; ok {
		return s, nil
	}
	return map[string]bool{}, nil
}

// ActiveSuperAdminIDs implements shared.SpineRepo.
func (f *FakeSpine) ActiveSuperAdminIDs(_ context.Context) ([]uuid.UUID, error) {
	return f.SuperIDs, nil
}

// UserIsSuperAdmin implements shared.SpineRepo.
func (f *FakeSpine) UserIsSuperAdmin(_ context.Context, userID uuid.UUID) (bool, error) {
	return f.SuperAdmin[userID], nil
}

// ActorWith returns an identity holding the given permissions.
func ActorWith(perms ...string) *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: append([]string(nil), perms...)}
}

// SuperActor returns an identity holding the wildcard "*".
func SuperActor() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{"*"}}
}

// AssertAppErr asserts err is an *AppError with the given status and key.
func AssertAppErr(t *testing.T, err error, status int, key string) {
	t.Helper()
	require.Error(t, err)
	ae, ok := apperr.As(err)
	require.True(t, ok, "expected *AppError, got %T: %v", err, err)
	require.Equal(t, status, ae.Status)
	require.Equal(t, key, ae.Key)
}

var (
	dbOnce sync.Once
	dbPool *pgxpool.Pool
	dbErr  error
)

// RequireDB returns a migrated test pool, lazily connecting once per test binary.
// Skips when TEST_DATABASE_URL is unset.
func RequireDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	dbOnce.Do(func() {
		if err := db.Migrate(url, migrations.FS); err != nil {
			dbErr = err
			return
		}
		dbPool, dbErr = pgxpool.New(context.Background(), url)
	})
	if dbErr != nil {
		t.Fatalf("admin test db: %v", dbErr)
	}
	return dbPool
}
