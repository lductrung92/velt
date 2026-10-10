package settings

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
)

// A scoped writer that does NOT hold settings.manage may still write keys under
// the allowed prefix (the calling module gates its own permission).
func TestUpdateScoped_NoManageCheck_AllowsPrefixedKey(t *testing.T) {
	e := newTestSvc(t)
	id := &httpx.Identity{UserID: uuid.New(), Permissions: []string{"cms.settings.manage"}} // no settings.manage
	view, err := e.svc.UpdateScoped(context.Background(), id,
		map[string]json.RawMessage{"app.name": raw(`"Velt X"`)}, "app.")
	require.NoError(t, err)
	require.Equal(t, "Velt X", findEntry(t, view, "general", "app.name")["value"])
	require.Equal(t, 1, e.repo.applyCount)
	require.Equal(t, 1, e.cache.invalidated)
}

func TestUpdateScoped_RejectsNonPrefixKey(t *testing.T) {
	e := newTestSvc(t)
	id := &httpx.Identity{UserID: uuid.New()}
	_, err := e.svc.UpdateScoped(context.Background(), id,
		map[string]json.RawMessage{"storage.driver": raw(`"s3"`)}, "app.")
	assertAppErr(t, err, 422, "unknown_setting_key")
	require.Equal(t, 0, e.repo.applyCount, "must not write when any key is out of scope")
}

func TestUpdateScoped_RejectsUnknownKey(t *testing.T) {
	e := newTestSvc(t)
	id := &httpx.Identity{UserID: uuid.New()}
	_, err := e.svc.UpdateScoped(context.Background(), id,
		map[string]json.RawMessage{"app.nope": raw(`"x"`)}, "app.")
	assertAppErr(t, err, 422, "unknown_setting_key")
}

func TestUpdateScoped_ValidatesValue(t *testing.T) {
	e := newTestSvc(t)
	id := &httpx.Identity{UserID: uuid.New()}
	_, err := e.svc.UpdateScoped(context.Background(), id,
		map[string]json.RawMessage{"app.default_locale": raw(`"fr"`)}, "app.")
	assertAppErr(t, err, 422, "validation_error")
	require.Equal(t, 0, e.repo.applyCount)
}

func TestUpdateScoped_NilIdentity(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.UpdateScoped(context.Background(), nil,
		map[string]json.RawMessage{"app.name": raw(`"X"`)}, "app.")
	assertAppErr(t, err, 401, "unauthorized")
}

func TestUpdateScoped_EmptyUpdatesNoOp(t *testing.T) {
	e := newTestSvc(t)
	id := &httpx.Identity{UserID: uuid.New()}
	view, err := e.svc.UpdateScoped(context.Background(), id, map[string]json.RawMessage{}, "app.")
	require.NoError(t, err)
	require.NotEmpty(t, view["general"], "no-op still returns the current state")
	require.Equal(t, 0, e.repo.applyCount, "empty updates must not write")
	require.Equal(t, 0, e.cache.invalidated, "empty updates must not invalidate cache")
}

func TestGroupView_ReturnsGroupEntries(t *testing.T) {
	e := newTestSvc(t)
	view, err := e.svc.GroupView(context.Background(), "general")
	require.NoError(t, err)
	require.NotEmpty(t, view["general"])
	findEntry(t, view, "general", "app.name") // present via registry default
}

func TestGroupView_UnknownGroupEmptyNotNil(t *testing.T) {
	e := newTestSvc(t)
	view, err := e.svc.GroupView(context.Background(), "nope")
	require.NoError(t, err)
	require.NotNil(t, view["nope"])
	require.Len(t, view["nope"], 0)
}
