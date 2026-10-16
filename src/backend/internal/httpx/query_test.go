package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
)

func dateRange(t *testing.T, query string) (*time.Time, *time.Time, error) {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/?"+query, nil)
	return QueryDateRange(r, "created_from", "created_to")
}

func TestQueryDateRange_AbsentIsNoRange(t *testing.T) {
	from, to, err := dateRange(t, "")
	require.NoError(t, err)
	require.Nil(t, from)
	require.Nil(t, to)
}

func TestQueryDateRange_BoundsAreVietnamMidnightAndEndInclusive(t *testing.T) {
	from, to, err := dateRange(t, "created_from=2026-10-10&created_to=2026-10-13")
	require.NoError(t, err)
	require.Equal(t, "2026-10-10T00:00:00+07:00", from.Format(time.RFC3339))
	// Midnight after the 13th: everything stamped on the 13th is still < to.
	require.Equal(t, "2026-10-14T00:00:00+07:00", to.Format(time.RFC3339))
}

func TestQueryDateRange_SameDayIsOneWholeDay(t *testing.T) {
	from, to, err := dateRange(t, "created_from=2026-10-13&created_to=2026-10-13")
	require.NoError(t, err)
	require.Equal(t, 24*time.Hour, to.Sub(*from))
}

func TestQueryDateRange_EitherSideAlone(t *testing.T) {
	from, to, err := dateRange(t, "created_from=2026-10-10")
	require.NoError(t, err)
	require.NotNil(t, from)
	require.Nil(t, to)

	from, to, err = dateRange(t, "created_to=2026-10-10")
	require.NoError(t, err)
	require.Nil(t, from)
	require.NotNil(t, to)
}

func TestQueryDateRange_RejectsUnparseableValues(t *testing.T) {
	for _, bad := range []string{"13-10-2026", "2026-13-01", "2026-10-32", "2026-1-5", "2026-10-13T00:00:00Z", "yesterday"} {
		_, _, err := dateRange(t, "created_from="+bad)
		ae, ok := apperr.As(err)
		require.True(t, ok, "%q should be rejected", bad)
		require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
		require.Equal(t, "validation_error", ae.Key)
		require.Equal(t, "invalid", ae.Details["fields"].(map[string]any)["created_from"])
	}
}

func TestQueryDateRange_NamesTheOffendingParam(t *testing.T) {
	_, _, err := dateRange(t, "created_from=2026-10-10&created_to=nope")
	ae, _ := apperr.As(err)
	require.Equal(t, "invalid", ae.Details["fields"].(map[string]any)["created_to"])
}

func TestQueryDateRange_RejectsReversedRange(t *testing.T) {
	_, _, err := dateRange(t, "created_from=2026-10-14&created_to=2026-10-13")
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
	require.Equal(t, "validation_error", ae.Key)
	require.Equal(t, "after_created_to", ae.Details["fields"].(map[string]any)["created_from"])
}

func TestLocale_KeepsThePrimarySubtag(t *testing.T) {
	read := func(header string) string {
		r := httptest.NewRequest(http.MethodGet, "/x", nil)
		if header != "" {
			r.Header.Set("Accept-Language", header)
		}
		return Locale(r)
	}
	require.Equal(t, "en", read("en"))
	require.Equal(t, "en", read("en-GB"))
	require.Equal(t, "en", read("en-GB,en;q=0.9,vi;q=0.8"))
	require.Equal(t, "vi", read("VI"))
	// Nothing asked for, or nothing a language tag can be read out of: the
	// caller leaves its rows in the source language.
	require.Equal(t, "", read(""))
	require.Equal(t, "", read("*"))
	require.Equal(t, "", read("12"))
}
