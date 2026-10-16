package activity

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/retention"
)

// Service is the activity-log read use-case layer.
type Service struct {
	repo Repository
	log  *slog.Logger
	now  func() time.Time
}

// Options configures the service. Both fields default when nil, so a caller
// that does not care about the clock or the logger passes the zero value.
type Options struct {
	Now    func() time.Time
	Logger *slog.Logger
}

// NewService builds the activity service.
func NewService(repo Repository, opts Options) *Service {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	return &Service{repo: repo, log: opts.Logger, now: opts.Now}
}

// List returns a page of the log. Requires activity.read.
func (s *Service) List(ctx context.Context, id *httpx.Identity, p ListParams) (ListResponse, error) {
	if err := s.require(ctx, id, permRead); err != nil {
		return ListResponse{}, err
	}
	p, searchFrom := s.normalize(p)
	rows, total, err := s.repo.List(ctx, p)
	if err != nil {
		s.sec(ctx).Error("activity: list", "err", err)
		return ListResponse{}, apperr.Internal()
	}
	return ListResponse{
		Items: rows, Total: total, Page: p.Page, PageSize: p.PageSize,
		SearchFrom: searchFrom,
	}, nil
}

// Actions returns the action codes present in the log. Requires activity.read:
// the set of codes alone says which parts of the system are in use.
func (s *Service) Actions(ctx context.Context, id *httpx.Identity) (ActionsResponse, error) {
	if err := s.require(ctx, id, permRead); err != nil {
		return ActionsResponse{}, err
	}
	codes, err := s.repo.Actions(ctx)
	if err != nil {
		s.sec(ctx).Error("activity: actions", "err", err)
		return ActionsResponse{}, apperr.Internal()
	}
	return ActionsResponse{Items: codes}, nil
}

// Purge deletes everything older than the given retention window and returns
// how many rows went. Requires activity.purge, NOT activity.read: whoever may
// read the log is not thereby allowed to empty it.
//
// The cutoff is dated from the server's clock rather than taken from the
// request, so a client with a wrong clock cannot widen the delete.
func (s *Service) Purge(ctx context.Context, id *httpx.Identity, olderThan string) (PurgeResponse, error) {
	if err := s.require(ctx, id, permPurge); err != nil {
		return PurgeResponse{}, err
	}
	before, ok := retention.Cutoff(olderThan, s.now())
	if !ok {
		return PurgeResponse{}, apperr.Validation(map[string]string{"older_than": "invalid"})
	}
	deleted, err := s.repo.Purge(ctx, before)
	if err != nil {
		s.sec(ctx).Error("activity: purge", "err", err)
		return PurgeResponse{}, apperr.Internal()
	}
	// The purge cannot be recorded in the log it just emptied by this module —
	// nothing here holds a recorder — so it is reported where the rest of this
	// package's security events go.
	s.sec(ctx).Warn("activity log purged",
		"actor", id.UserID, "older_than", olderThan, "deleted", deleted)
	return PurgeResponse{Deleted: deleted}, nil
}

// normalize clamps paging and bounds a free-text search. It returns the window
// the search was clamped to, or nil when the caller supplied its own, so the
// response can say which rows were actually looked at.
func (s *Service) normalize(p ListParams) (ListParams, *time.Time) {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = defaultPageSize
	}
	if p.PageSize > maxPageSize {
		p.PageSize = maxPageSize
	}
	p.Query = strings.TrimSpace(p.Query)
	if len([]rune(p.Query)) < minQueryLen {
		p.Query = ""
	}
	if p.Query == "" || !p.From.IsZero() {
		return p, nil
	}
	// Free text has no index to stand on, so it never runs unbounded: without
	// a date range it searches the recent window and says so.
	from := s.now().Add(-searchWindow)
	p.From = from
	return p, &from
}

func (s *Service) require(ctx context.Context, id *httpx.Identity, perm string) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	if id.Has(perm) {
		return nil
	}
	s.sec(ctx).Warn("activity access denied", "actor", id.UserID, "action", "permission:"+perm)
	return apperr.AccessDenied("access_denied")
}

func (s *Service) sec(ctx context.Context) *slog.Logger {
	return s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}
