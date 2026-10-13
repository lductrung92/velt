package activity

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
)

func ctx() context.Context { return context.Background() }

func assertStatus(t *testing.T, err error, status int, key string) {
	t.Helper()
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, status, ae.Status)
	require.Equal(t, key, ae.Key)
}

func TestReadsRequireTheActivityPermission(t *testing.T) {
	e := newEnv(entry("article.publish", 0, nil, "system"))

	_, err := e.svc.List(ctx(), stranger(), ListParams{})
	assertStatus(t, err, http.StatusForbidden, "access_denied")
	_, err = e.svc.Actions(ctx(), stranger())
	assertStatus(t, err, http.StatusForbidden, "access_denied")

	// An anonymous caller is 401, not 403: there is nobody to deny yet.
	_, err = e.svc.List(ctx(), nil, ListParams{})
	assertStatus(t, err, http.StatusUnauthorized, "unauthorized")

	require.Zero(t, e.repo.calls, "a denied read must not reach the database")
}

func TestFiltersNarrowToTheIndexedColumns(t *testing.T) {
	alice, bob := uuid.New(), uuid.New()
	article := uuid.New()
	e := newEnv(
		withTarget(entry("article.publish", 0, &alice, "Alice"), "article", article, "Ra mat VELT"),
		entry("auth.login", 1, &alice, "Alice"),
		entry("auth.login", 2, &bob, "Bob"),
	)

	page, err := e.svc.List(ctx(), reader(), ListParams{ActorID: &alice})
	require.NoError(t, err)
	require.Equal(t, 2, page.Total)

	page, err = e.svc.List(ctx(), reader(), ListParams{Action: "auth.login"})
	require.NoError(t, err)
	require.Equal(t, 2, page.Total)

	page, err = e.svc.List(ctx(), reader(), ListParams{Entity: "article", EntityID: &article})
	require.NoError(t, err)
	require.Equal(t, 1, page.Total)
	require.Equal(t, "Ra mat VELT", *page.Items[0].EntityLabel)

	// A date range narrows to the window, endpoints included.
	page, err = e.svc.List(ctx(), reader(), ListParams{
		From: clock.AddDate(0, 0, -1), To: clock,
	})
	require.NoError(t, err)
	require.Equal(t, 2, page.Total)
}

func TestPaginationClampsAndWalksTheWholeSet(t *testing.T) {
	rows := make([]Entry, 0, 25)
	for i := range 25 {
		rows = append(rows, entry("article.publish", i, nil, "system"))
	}
	e := newEnv(rows...)

	// Absent page/page_size fall back rather than asking for row -20.
	page, err := e.svc.List(ctx(), reader(), ListParams{})
	require.NoError(t, err)
	require.Equal(t, 1, page.Page)
	require.Equal(t, defaultPageSize, page.PageSize)
	require.Len(t, page.Items, defaultPageSize)
	require.Equal(t, 25, page.Total)

	page, err = e.svc.List(ctx(), reader(), ListParams{Page: 2, PageSize: 10})
	require.NoError(t, err)
	require.Len(t, page.Items, 10)
	require.Equal(t, int64(11), page.Items[0].ID)

	// Past the end is an empty page, not an error.
	page, err = e.svc.List(ctx(), reader(), ListParams{Page: 9, PageSize: 10})
	require.NoError(t, err)
	require.Empty(t, page.Items)
	require.Equal(t, 25, page.Total)

	// The page-size ceiling protects the scan, so it is clamped, not honoured.
	page, err = e.svc.List(ctx(), reader(), ListParams{PageSize: 5000})
	require.NoError(t, err)
	require.Equal(t, maxPageSize, page.PageSize)
}

func TestFreeTextIsBoundedToAWindowAndSaysSo(t *testing.T) {
	alice := uuid.New()
	e := newEnv(
		entry("auth.login", 1, &alice, "Alice"),
		entry("auth.login", 200, &alice, "Alice"), // older than searchWindow
	)

	page, err := e.svc.List(ctx(), reader(), ListParams{Query: "alice"})
	require.NoError(t, err)
	require.Equal(t, 1, page.Total, "an unbounded search would scan the whole log")
	require.NotNil(t, page.SearchFrom)
	require.Equal(t, clock.Add(-searchWindow), *page.SearchFrom)

	// An explicit range is the caller's own bound, so it is left alone.
	page, err = e.svc.List(ctx(), reader(), ListParams{
		Query: "alice", From: clock.AddDate(-1, 0, 0),
	})
	require.NoError(t, err)
	require.Equal(t, 2, page.Total)
	require.Nil(t, page.SearchFrom)

	// Browsing without a search is never clamped — that is what the
	// occurred_at index is for.
	page, err = e.svc.List(ctx(), reader(), ListParams{})
	require.NoError(t, err)
	require.Equal(t, 2, page.Total)
	require.Nil(t, page.SearchFrom)
}

func TestASingleCharacterIsNotASearch(t *testing.T) {
	// It matches nearly every row, so it costs the whole scan and tells the
	// reader nothing. Dropped before it reaches the query.
	e := newEnv(entry("auth.login", 1, nil, "Alice"))
	_, err := e.svc.List(ctx(), reader(), ListParams{Query: " a "})
	require.NoError(t, err)
	require.Empty(t, e.repo.seen.Query)
	require.True(t, e.repo.seen.From.IsZero(), "no search, no window")
}

func TestRepositoryFailureStaysOffTheWire(t *testing.T) {
	e := newEnv()
	e.repo.failed = errors.New("connection refused")
	_, err := e.svc.List(ctx(), reader(), ListParams{})
	assertStatus(t, err, http.StatusInternalServerError, "internal_server_error")
	_, err = e.svc.Actions(ctx(), reader())
	assertStatus(t, err, http.StatusInternalServerError, "internal_server_error")
}

func TestActionsListsWhatIsActuallyInTheLog(t *testing.T) {
	e := newEnv(
		entry("article.publish", 0, nil, "system"),
		entry("auth.login", 1, nil, "system"),
		entry("article.publish", 2, nil, "system"),
	)
	res, err := e.svc.Actions(ctx(), reader())
	require.NoError(t, err)
	require.Equal(t, []string{"article.publish", "auth.login"}, res.Items)
}
