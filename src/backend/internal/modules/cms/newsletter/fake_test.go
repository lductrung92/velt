package newsletter

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakeRepo is an in-memory newsletter Repository for service unit tests.
type fakeRepo struct {
	subscribers map[uuid.UUID]*Subscriber
	now         time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{subscribers: map[uuid.UUID]*Subscriber{}, now: now}
}

func (r *fakeRepo) seedSubscriber(email string, unsubscribed bool) *Subscriber {
	s := &Subscriber{ID: uuid.New(), Email: email, CreatedAt: r.now}
	if unsubscribed {
		t := r.now
		s.UnsubscribedAt = &t
	}
	r.subscribers[s.ID] = s
	return s
}

func (r *fakeRepo) ListSubscribers(_ context.Context, p ListParams) ([]Subscriber, int, error) {
	matched := []Subscriber{}
	for _, s := range r.subscribers {
		switch p.Status {
		case StatusActive:
			if s.UnsubscribedAt != nil {
				continue
			}
		case StatusUnsubscribed:
			if s.UnsubscribedAt == nil {
				continue
			}
		}
		matched = append(matched, *s)
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].Email < matched[j].Email })
	total := len(matched)
	start := (p.Page - 1) * p.PageSize
	if start > total {
		start = total
	}
	end := start + p.PageSize
	if end > total {
		end = total
	}
	return matched[start:end], total, nil
}

func (r *fakeRepo) GetSubscriber(_ context.Context, id uuid.UUID) (*Subscriber, error) {
	s, ok := r.subscribers[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *s
	return &cp, nil
}

func (r *fakeRepo) DeleteSubscriber(_ context.Context, id uuid.UUID) error {
	delete(r.subscribers, id)
	return nil
}

// Reports whether the address was new, like the real ON CONFLICT ... RETURNING
// xmax = 0 does: re-activating an existing row is not a new subscriber.
func (r *fakeRepo) Subscribe(_ context.Context, email string, source, _ *string) (bool, error) {
	for _, s := range r.subscribers {
		if s.Email == email { // idempotent upsert: re-activate
			s.UnsubscribedAt = nil
			return false, nil
		}
	}
	s := &Subscriber{ID: uuid.New(), Email: email, SourceKey: source, CreatedAt: r.now}
	r.subscribers[s.ID] = s
	return true, nil
}

type tenv struct {
	svc  *Service
	repo *fakeRepo
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	base := shared.NewBase(&cmstest.FakeSettings{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return &tenv{svc: NewService(base, repo), repo: repo}
}
