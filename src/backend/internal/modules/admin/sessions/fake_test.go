package sessions

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/modules/admin/shared/admintest"
)

type fakeUser struct {
	id       uuid.UUID
	fullName string
	email    string
}

type fakeSession struct {
	userID  uuid.UUID
	created time.Time
	expires time.Time
	revoked bool
}

// fakeRepo is an in-memory session Repository for service unit tests.
type fakeRepo struct {
	sessions map[uuid.UUID]*fakeSession
	users    map[uuid.UUID]fakeUser
	now      time.Time
	// What the service worked out and handed down on the last purge.
	purgedBefore  time.Time
	purgedKeeping uuid.UUID
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{sessions: map[uuid.UUID]*fakeSession{}, users: map[uuid.UUID]fakeUser{}, now: now}
}

func (r *fakeRepo) addUser(email string) fakeUser {
	u := fakeUser{id: uuid.New(), fullName: "U", email: email}
	r.users[u.id] = u
	return u
}

func (r *fakeRepo) addSession(userID uuid.UUID) uuid.UUID {
	return r.addSessionAged(userID, 0)
}

// addSessionAged dates a session ageDays in the past, so the purge window has
// something to be right or wrong about.
func (r *fakeRepo) addSessionAged(userID uuid.UUID, ageDays int) uuid.UUID {
	id := uuid.New()
	r.sessions[id] = &fakeSession{
		userID:  userID,
		created: r.now.AddDate(0, 0, -ageDays),
		expires: r.now.Add(time.Hour),
	}
	return id
}

func (r *fakeRepo) ListSessions(_ context.Context, f ListFilter, now time.Time) ([]SessionResponse, int, error) {
	var out []SessionResponse
	for id, s := range r.sessions {
		if f.UserID != nil && s.userID != *f.UserID {
			continue
		}
		if f.Active && (s.revoked || !s.expires.After(now)) {
			continue
		}
		u := r.users[s.userID]
		out = append(out, SessionResponse{ID: id, UserID: s.userID, FullName: u.fullName, Email: u.email, ExpiresAt: s.expires})
	}
	return out, len(out), nil
}

func (r *fakeRepo) GetSessionUser(_ context.Context, id uuid.UUID) (uuid.UUID, error) {
	s, ok := r.sessions[id]
	if !ok {
		return uuid.Nil, shared.ErrNotFound
	}
	return s.userID, nil
}

func (r *fakeRepo) RevokeSession(_ context.Context, id uuid.UUID, _ time.Time) error {
	if s, ok := r.sessions[id]; ok {
		s.revoked = true
	}
	return nil
}

func (r *fakeRepo) RevokeAllUserSessions(_ context.Context, userID uuid.UUID, _ time.Time) error {
	for _, s := range r.sessions {
		if s.userID == userID {
			s.revoked = true
		}
	}
	return nil
}

// PurgeSessions keeps the rows created at or after the cutoff and drops the
// rest, which is what `DELETE ... WHERE created_at < $2` does. keepUser's rows
// are never touched. A zero cutoff drops everything else.
func (r *fakeRepo) PurgeSessions(_ context.Context, before time.Time, keepUser uuid.UUID) (int64, error) {
	r.purgedBefore, r.purgedKeeping = before, keepUser
	var deleted int64
	for id, s := range r.sessions {
		if s.userID == keepUser {
			continue
		}
		if !before.IsZero() && !s.created.Before(before) {
			continue
		}
		delete(r.sessions, id)
		deleted++
	}
	return deleted, nil
}

func (r *fakeRepo) UserExists(_ context.Context, id uuid.UUID) (bool, error) {
	_, ok := r.users[id]
	return ok, nil
}

func (r *fakeRepo) UserLabel(_ context.Context, id uuid.UUID) (string, error) {
	u, ok := r.users[id]
	if !ok {
		return "", shared.ErrNotFound
	}
	return u.fullName, nil
}

type tenv struct {
	svc   *Service
	repo  *fakeRepo
	spine *admintest.FakeSpine
	clk   time.Time
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	spine := admintest.NewFakeSpine()
	base := shared.NewBase(spine, nil, nil, nil, shared.Options{
		Now:    func() time.Time { return clk },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return &tenv{svc: NewService(base, repo), repo: repo, spine: spine, clk: clk}
}
