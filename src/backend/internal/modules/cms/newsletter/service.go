package newsletter

import (
	"context"
	"errors"
	"net"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Service holds newsletter business logic. Every action is permission-gated.
type Service struct {
	*shared.Base
	repo Repository
	// notify rings whoever looks after the mailing list. Optional.
	notify NotifyPort
}

// NotifyPort is the one thing this module asks of the notification stack.
// An interface so a subscription can be tested with no push infrastructure.
type NotifyPort interface {
	NewsletterSubscribed(ctx context.Context)
}

// SetNotifier supplies the notification sink.
func (s *Service) SetNotifier(n NotifyPort) { s.notify = n }

// NewService wires the newsletter service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListSubscribers returns the paginated subscriber list (PII stripped).
// Requires cms.newsletter.manage.
func (s *Service) ListSubscribers(ctx context.Context, id *httpx.Identity, p ListParams) (ListResult, error) {
	if err := s.Require(ctx, id, permNewsletterManage); err != nil {
		return ListResult{}, err
	}
	if p.Status != "" && !validStatus[p.Status] {
		return ListResult{}, apperr.Validation(map[string]string{"status": "invalid_value"})
	}
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 || p.PageSize > maxPageSize {
		p.PageSize = 20
	}
	rows, total, err := s.repo.ListSubscribers(ctx, p)
	if err != nil {
		return ListResult{}, apperr.Internal()
	}
	items := make([]SubscriberItem, 0, len(rows))
	for _, sub := range rows {
		items = append(items, toItem(sub))
	}
	return ListResult{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// Subscribe is the PUBLIC opt-in (no auth). Idempotent: a repeated or previously
// unsubscribed email succeeds without leaking whether it already existed.
func (s *Service) Subscribe(ctx context.Context, req SubscribeRequest, ip string) error {
	email := strings.TrimSpace(req.Email)
	if email == "" {
		return apperr.Validation(map[string]string{"email": "required"})
	}
	var source *string
	if req.Source != "" {
		source = &req.Source
	}
	// Persist the caller IP only when it is a valid address (audit; INET column).
	var ipp *string
	if net.ParseIP(ip) != nil {
		ipp = &ip
	}
	created, err := s.repo.Subscribe(ctx, email, source, ipp)
	if err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("cms newsletter subscribe", "source", req.Source, "new", created)
	// Only a genuinely new address is worth interrupting somebody for. A
	// repeat is the same person pressing the button twice, and the endpoint
	// is public: without this guard one script could ring the team all day.
	//
	if created && s.notify != nil {
		s.notify.NewsletterSubscribed(ctx)
	}
	return nil
}

// DeleteSubscriber removes a subscriber (GDPR/cleanup). Requires cms.newsletter.manage.
func (s *Service) DeleteSubscriber(ctx context.Context, id *httpx.Identity, subID uuid.UUID) error {
	if err := s.Require(ctx, id, permNewsletterManage); err != nil {
		return err
	}
	// Read before the delete: the address is the only label this row can carry.
	cur, err := s.repo.GetSubscriber(ctx, subID)
	if err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return apperr.NotFound("not_found")
		}
		return apperr.Internal()
	}
	if err := s.repo.DeleteSubscriber(ctx, subID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("cms newsletter subscriber deleted", "actor", id.UserID, "subscriber", subID)
	s.Record(ctx, id, subscriberEntry(actionSubscriberDeleted, subID, cur.Email))
	return nil
}
