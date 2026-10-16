package activity

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// A three-day window keeps the row from two days ago and deletes the one from
// four. This is the whole contract of "3 ngày trước" in the console's menu.
func TestPurgeKeepsTheWindowAndDeletesWhatIsOlder(t *testing.T) {
	e := newEnv(
		entry("auth.login", 2, nil, "Alice"),
		entry("auth.login", 4, nil, "Bob"),
	)

	res, err := e.svc.Purge(ctx(), purger(), "3d")
	require.NoError(t, err)
	require.EqualValues(t, 1, res.Deleted)

	require.Len(t, e.repo.rows, 1)
	require.Equal(t, "Alice", e.repo.rows[0].ActorLabel)
	require.True(t, e.repo.purgedBefore.Equal(clock.AddDate(0, 0, -3)),
		"cutoff must be dated from the server clock, got %v", e.repo.purgedBefore)
}

// "Tất cả" is the one window with no lower bound.
func TestPurgeAllEmptiesTheLog(t *testing.T) {
	e := newEnv(
		entry("auth.login", 0, nil, "Alice"),
		entry("auth.login", 400, nil, "Bob"),
	)

	res, err := e.svc.Purge(ctx(), purger(), "all")
	require.NoError(t, err)
	require.EqualValues(t, 2, res.Deleted)
	require.Empty(t, e.repo.rows)
	require.True(t, e.repo.purgedBefore.IsZero(), "all means no lower bound")
}

// Every window the console offers has to resolve, or the menu lies.
func TestPurgeAcceptsEveryOfferedWindow(t *testing.T) {
	for _, code := range []string{"all", "3d", "7d", "1m", "3m", "6m", "1y"} {
		e := newEnv(entry("auth.login", 0, nil, "Alice"))
		if _, err := e.svc.Purge(ctx(), purger(), code); err != nil {
			t.Errorf("window %q rejected: %v", code, err)
		}
	}
}

func TestPurgeRejectsAWindowNobodyOffers(t *testing.T) {
	e := newEnv(entry("auth.login", 400, nil, "Bob"))
	_, err := e.svc.Purge(ctx(), purger(), "2w")
	assertStatus(t, err, http.StatusUnprocessableEntity, "validation_error")
	require.False(t, e.repo.purged, "an unparseable window must not reach the database")
}

// Reading the record of what everyone did is not permission to erase it.
func TestPurgeRequiresItsOwnPermission(t *testing.T) {
	e := newEnv(entry("auth.login", 400, nil, "Bob"))

	_, err := e.svc.Purge(ctx(), reader(), "3d")
	assertStatus(t, err, http.StatusForbidden, "access_denied")

	_, err = e.svc.Purge(ctx(), stranger(), "3d")
	assertStatus(t, err, http.StatusForbidden, "access_denied")

	// An anonymous caller is 401, not 403: there is nobody to deny yet.
	_, err = e.svc.Purge(ctx(), nil, "3d")
	assertStatus(t, err, http.StatusUnauthorized, "unauthorized")

	require.False(t, e.repo.purged, "a denied purge must not reach the database")
	require.Len(t, e.repo.rows, 1)
}
