package activity

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
)

// fakeRepo is an in-memory stand-in that reproduces the filters the SQL
// applies, so the service tests cover the plumbing without a database. The SQL
// itself is covered by repository_integration_test.go.
type fakeRepo struct {
	rows   []Entry
	seen   ListParams // the params the service actually handed down
	calls  int
	failed error
	// purged/purgedBefore record the cutoff the service worked out, so a test
	// can assert the window maths without reading the surviving rows.
	purged       bool
	purgedBefore time.Time
}

func (r *fakeRepo) List(_ context.Context, p ListParams) ([]Entry, int, error) {
	r.seen, r.calls = p, r.calls+1
	if r.failed != nil {
		return nil, 0, r.failed
	}
	matched := []Entry{}
	for _, e := range r.rows {
		if p.ActorID != nil && (e.ActorID == nil || *e.ActorID != *p.ActorID) {
			continue
		}
		if p.Action != "" && e.Action != p.Action {
			continue
		}
		if p.Entity != "" && (e.Entity == nil || *e.Entity != p.Entity) {
			continue
		}
		if p.EntityID != nil && (e.EntityID == nil || *e.EntityID != *p.EntityID) {
			continue
		}
		if !p.From.IsZero() && e.OccurredAt.Before(p.From) {
			continue
		}
		if !p.To.IsZero() && e.OccurredAt.After(p.To) {
			continue
		}
		if p.Query != "" && !matchesText(e, p.Query) {
			continue
		}
		matched = append(matched, e)
	}
	start := min((p.Page-1)*p.PageSize, len(matched))
	end := min(start+p.PageSize, len(matched))
	return matched[start:end], len(matched), nil
}

func matchesText(e Entry, q string) bool {
	q = strings.ToLower(q)
	label := ""
	if e.EntityLabel != nil {
		label = *e.EntityLabel
	}
	return strings.Contains(strings.ToLower(e.ActorLabel), q) ||
		strings.Contains(strings.ToLower(label), q) ||
		strings.Contains(strings.ToLower(e.Action), q)
}

// Purge keeps the rows at or after the cutoff and drops the rest, which is
// what `DELETE ... WHERE occurred_at < $1` does. A zero cutoff drops the lot.
func (r *fakeRepo) Purge(_ context.Context, before time.Time) (int64, error) {
	r.purgedBefore, r.purged = before, true
	if r.failed != nil {
		return 0, r.failed
	}
	kept := []Entry{}
	for _, e := range r.rows {
		if before.IsZero() || e.OccurredAt.Before(before) {
			continue
		}
		kept = append(kept, e)
	}
	deleted := int64(len(r.rows) - len(kept))
	r.rows = kept
	return deleted, nil
}

func (r *fakeRepo) Actions(context.Context) ([]string, error) {
	if r.failed != nil {
		return nil, r.failed
	}
	seen := map[string]bool{}
	out := []string{}
	for _, e := range r.rows {
		if !seen[e.Action] {
			seen[e.Action] = true
			out = append(out, e.Action)
		}
	}
	return out, nil
}

// clock is a fixed "now" so the free-text window is assertable.
var clock = time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)

type env struct {
	svc  *Service
	repo *fakeRepo
}

func newEnv(rows ...Entry) *env {
	repo := &fakeRepo{rows: rows}
	return &env{repo: repo, svc: NewService(repo, Options{
		Now:    func() time.Time { return clock },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})}
}

func reader() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permRead}}
}

func purger() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permRead, permPurge}}
}

func stranger() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{"users.read"}}
}

// entry builds a row. The actor is a pointer so a system action — nobody to
// blame, but still named — is expressible.
func entry(action string, ageDays int, actor *uuid.UUID, actorLabel string) Entry {
	return Entry{
		ID:         int64(ageDays + 1),
		OccurredAt: clock.AddDate(0, 0, -ageDays),
		Action:     action,
		ActorID:    actor,
		ActorLabel: actorLabel,
		Metadata:   json.RawMessage(`{}`),
	}
}

func withTarget(e Entry, entity string, id uuid.UUID, label string) Entry {
	e.Entity, e.EntityID, e.EntityLabel = &entity, &id, &label
	return e
}
