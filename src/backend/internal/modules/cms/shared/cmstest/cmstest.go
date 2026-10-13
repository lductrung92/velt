// Package cmstest provides shared test helpers for the cms feature packages:
// identity builders, AppError assertions, and a SettingsPort fake. It is
// imported only from _test.go files.
package cmstest

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/settings"
)

// ActorWith returns an identity whose claims hold the given permissions.
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

// AssertFieldErr asserts a 422 validation_error whose details.fields[field] == key.
func AssertFieldErr(t *testing.T, err error, field, key string) {
	t.Helper()
	ae, ok := apperr.As(err)
	require.True(t, ok, "expected *AppError, got %T: %v", err, err)
	require.Equal(t, "validation_error", ae.Key)
	fields, ok := ae.Details["fields"].(map[string]any)
	require.True(t, ok, "expected details.fields map, got %v", ae.Details)
	require.Equal(t, key, fields[field], "field %q", field)
}

// Strptr returns a pointer to s.
func Strptr(s string) *string { return &s }

// FakeSettings is an in-memory SettingsPort for feature service unit tests.
type FakeSettings struct {
	Group       []map[string]any
	MaxUploadMB int
}

// GroupView returns the configured group view.
func (f *FakeSettings) GroupView(_ context.Context, group string) (settings.GroupedView, error) {
	return settings.GroupedView{group: f.Group}, nil
}

// UpdateScoped records nothing; returns the current group view.
func (f *FakeSettings) UpdateScoped(_ context.Context, _ *httpx.Identity, _ map[string]json.RawMessage, _ ...string) (settings.GroupedView, error) {
	return settings.GroupedView{"cms": f.Group}, nil
}

// GetInt serves foundation reads (storage.max_upload_mb); 0 = use the default.
func (f *FakeSettings) GetInt(_ context.Context, key string) int {
	if key == "storage.max_upload_mb" {
		return f.MaxUploadMB
	}
	return 0
}
