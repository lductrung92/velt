package comments

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Service holds comment-moderation business logic.
type Service struct {
	*shared.Base
	repo Repository
}

// NewService wires the comments service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListComments returns the moderation queue. Requires cms.comment.moderate.
// PII (email/ip) is included for the moderating admin and is never logged.
func (s *Service) ListComments(ctx context.Context, id *httpx.Identity, p ListParams) (ListResult, error) {
	if err := s.Require(ctx, id, permModerate); err != nil {
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
	rows, total, err := s.repo.List(ctx, p)
	if err != nil {
		return ListResult{}, apperr.Internal()
	}
	items := make([]Item, 0, len(rows))
	for _, r := range rows {
		items = append(items, toItem(r))
	}
	return ListResult{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// UpdateComment sets a moderation status (approved/spam/rejected). approved sets
// approved_at. Requires cms.comment.moderate.
func (s *Service) UpdateComment(ctx context.Context, id *httpx.Identity, commentID uuid.UUID, req UpdateRequest) (Item, error) {
	if err := s.Require(ctx, id, permModerate); err != nil {
		return Item{}, err
	}
	// Moderation may only set approved/spam/rejected (not back to pending). Gate in
	// the service, not just the handler tag.
	switch req.Status {
	case StatusApproved, StatusSpam, StatusRejected:
	default:
		return Item{}, apperr.Validation(map[string]string{"status": "invalid_value"})
	}
	if _, err := s.repo.UpdateStatus(ctx, commentID, req.Status); err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return Item{}, apperr.NotFound("not_found")
		}
		return Item{}, apperr.Internal()
	}
	r, err := s.repo.GetRow(ctx, commentID)
	if err != nil {
		return Item{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms comment moderated", "actor", id.UserID, "comment", commentID, "status", req.Status)
	s.Record(ctx, id, commentEntry(actionModerated, commentID, r.AuthorName,
		map[string]any{"status": req.Status, "article": r.ArticleTitle}))
	return toItem(*r), nil
}

// DeleteComment removes a comment (replies cascade). Requires cms.comment.moderate.
func (s *Service) DeleteComment(ctx context.Context, id *httpx.Identity, commentID uuid.UUID) error {
	if err := s.Require(ctx, id, permModerate); err != nil {
		return err
	}
	// Read before the delete: replies cascade away with it, so afterwards there is
	// nothing left to say whose comment this was.
	cur, err := s.repo.GetRow(ctx, commentID)
	if err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return apperr.NotFound("not_found")
		}
		return apperr.Internal()
	}
	if err := s.repo.Delete(ctx, commentID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("cms comment deleted", "actor", id.UserID, "comment", commentID)
	s.Record(ctx, id, commentEntry(actionDeleted, commentID, cur.AuthorName,
		map[string]any{"status": cur.Status, "article": cur.ArticleTitle}))
	return nil
}
