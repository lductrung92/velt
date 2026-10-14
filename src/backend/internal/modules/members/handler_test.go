package members

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
)

func parseStaffListQuery(t *testing.T, query string) (ListParams, error) {
	t.Helper()
	return staffListParams(httptest.NewRequest(http.MethodGet, "/api/members?"+query, nil))
}

func TestStaffListParams_CreatedRangeResolvesToHalfOpenBounds(t *testing.T) {
	p, err := parseStaffListQuery(t, "created_from=2026-10-10&created_to=2026-10-13")
	require.NoError(t, err)
	require.Equal(t, "2026-10-10T00:00:00+07:00", p.CreatedFrom.Format("2006-01-02T15:04:05Z07:00"))
	require.Equal(t, "2026-10-14T00:00:00+07:00", p.CreatedTo.Format("2006-01-02T15:04:05Z07:00"))
}

func TestStaffListParams_CreatedRangeIsOptional(t *testing.T) {
	p, err := parseStaffListQuery(t, "active=true")
	require.NoError(t, err)
	require.Nil(t, p.CreatedFrom)
	require.Nil(t, p.CreatedTo)
}

func TestStaffListParams_UnparseableCreatedToIs422(t *testing.T) {
	_, err := parseStaffListQuery(t, "created_to=next%20friday")
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
	require.Equal(t, "validation_error", ae.Key)
	require.Equal(t, "invalid", ae.Details["fields"].(map[string]any)["created_to"])
}

func TestStaffListParams_CreatedFromAfterCreatedToIs422(t *testing.T) {
	_, err := parseStaffListQuery(t, "created_from=2026-10-14&created_to=2026-10-13")
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
	require.Equal(t, "after_created_to", ae.Details["fields"].(map[string]any)["created_from"])
}

// The public roster never gained the filter, so a date param there is still the
// unknown query param it always was.
func TestListParams_PublicRosterIgnoresTheCreatedRange(t *testing.T) {
	p := listParams(httptest.NewRequest(http.MethodGet, "/api/public/members?created_from=nope", nil))
	require.Nil(t, p.CreatedFrom)
	require.Nil(t, p.CreatedTo)
}
