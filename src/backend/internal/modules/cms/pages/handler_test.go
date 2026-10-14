package pages

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
)

func parsePageListQuery(t *testing.T, query string) (PageListParams, error) {
	t.Helper()
	return pageListParams(httptest.NewRequest(http.MethodGet, "/api/cms/pages?"+query, nil))
}

func TestPageListParams_CreatedRangeResolvesToHalfOpenBounds(t *testing.T) {
	p, err := parsePageListQuery(t, "created_from=2026-10-10&created_to=2026-10-13")
	require.NoError(t, err)
	require.Equal(t, "2026-10-10T00:00:00+07:00", p.CreatedFrom.Format("2006-01-02T15:04:05Z07:00"))
	require.Equal(t, "2026-10-14T00:00:00+07:00", p.CreatedTo.Format("2006-01-02T15:04:05Z07:00"))
}

func TestPageListParams_CreatedRangeIsOptional(t *testing.T) {
	p, err := parsePageListQuery(t, "")
	require.NoError(t, err)
	require.Nil(t, p.CreatedFrom)
	require.Nil(t, p.CreatedTo)
}

func TestPageListParams_UnparseableCreatedToIs422(t *testing.T) {
	_, err := parsePageListQuery(t, "created_to=2026-10-32")
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
	require.Equal(t, "validation_error", ae.Key)
	require.Equal(t, "invalid", ae.Details["fields"].(map[string]any)["created_to"])
}

func TestPageListParams_CreatedFromAfterCreatedToIs422(t *testing.T) {
	_, err := parsePageListQuery(t, "created_from=2026-10-14&created_to=2026-10-13")
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
	require.Equal(t, "after_created_to", ae.Details["fields"].(map[string]any)["created_from"])
}
