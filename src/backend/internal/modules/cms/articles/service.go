package articles

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/storage"
)

// Service holds article workflow business logic.
type Service struct {
	*shared.Base
	repo  Repository
	files storage.Storage
	// pub and tr are wired after construction (see public_sync.go) and are both
	// allowed to stay nil, which is what this module looked like before the
	// public read model and translations existed.
	pub *pubdocs.Store
	tr  Translator
}

// NewService wires the articles service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository, files storage.Storage) *Service {
	return &Service{Base: base, repo: repo, files: files}
}

// isReviewer reports whether the actor is a reviewer (admin-class): sees ALL
// articles + may approve/return. Editors lack cms.article.review.
func (s *Service) isReviewer(id *httpx.Identity) bool {
	return id != nil && id.Has(permReview)
}

// actorRole captures the reviewer-class of the creator at create time, stored on
// the article (author_role) so review gating stays stable if the role later changes.
func actorRole(id *httpx.Identity) string {
	for _, r := range id.Roles {
		if r == "super_admin" {
			return "super_admin"
		}
	}
	for _, r := range id.Roles {
		if r == "admin" {
			return "admin"
		}
	}
	if id.Has(permReview) { // reviewer via a custom role
		return "admin"
	}
	return "editor"
}

func isReviewerRole(role string) bool { return role == "admin" || role == "super_admin" }

// allowedStatuses computes the status-set an actor may assign (workflow-states §4),
// from actor-class × author-class × the two flags.
func allowedStatuses(actorIsReviewer, authorIsReviewer, isCreate, reviewOn, schedulingOn bool) map[string]bool {
	base := map[string]bool{ArticleStatusDraft: true, ArticleStatusArchived: true, ArticleStatusPublished: true}
	if schedulingOn {
		base[ArticleStatusScheduled] = true
	}
	if !actorIsReviewer { // editor, on own article
		if reviewOn {
			return map[string]bool{ArticleStatusDraft: true, ArticleStatusArchived: true, ArticleStatusPendingReview: true}
		}
		return base // review OFF → editor == everyone
	}
	if isCreate {
		return base // admin never creates straight into review states
	}
	if reviewOn && !authorIsReviewer { // editing an editor-authored article → full set
		base[ArticleStatusPendingReview] = true
		base[ArticleStatusNeedsRevision] = true
	}
	return base
}

// getOwned fetches an article with ABAC: a non-reviewer (editor) may only touch
// their own; another author's article is reported as 404 (no existence leak).
func (s *Service) getOwned(ctx context.Context, id *httpx.Identity, articleID uuid.UUID) (*Article, error) {
	a, err := s.repo.GetArticle(ctx, articleID)
	if err != nil {
		return nil, mapArticleGetErr(err)
	}
	if !s.isReviewer(id) && a.AuthorID != id.UserID {
		return nil, apperr.NotFound("not_found")
	}
	return a, nil
}

func mapArticleGetErr(err error) error {
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	return apperr.Internal()
}

func mapArticleWriteErr(err error) error {
	switch {
	case errors.Is(err, shared.ErrConflict):
		return apperr.Unprocessable("slug_already_exists")
	case errors.Is(err, shared.ErrOptLock):
		return apperr.Conflict("conflict")
	case errors.Is(err, shared.ErrNotFound):
		return apperr.NotFound("not_found")
	default:
		return apperr.Internal()
	}
}

// ListArticles returns a paginated article list. Requires cms.article.view; a
// non-reviewer is force-scoped to their own articles (ABAC).
func (s *Service) ListArticles(ctx context.Context, id *httpx.Identity, p ArticleListParams) (ArticleListResult, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return ArticleListResult{}, err
	}
	if p.Status != "" && !validArticleStatus[p.Status] {
		return ArticleListResult{}, apperr.Validation(map[string]string{"status": "invalid_value"})
	}
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 || p.PageSize > maxArticlePageSize {
		p.PageSize = 20
	}
	if !s.isReviewer(id) {
		self := id.UserID
		p.AuthorID = &self // ABAC: editors see only their own
	}
	rows, total, err := s.repo.ListArticles(ctx, p)
	if err != nil {
		return ArticleListResult{}, apperr.Internal()
	}
	items := make([]ArticleListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, toArticleListItem(r))
	}
	return ArticleListResult{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// GetArticle returns the full article (working copy + tags + snapshot). Requires
// cms.article.view; editor ABAC applies.
func (s *Service) GetArticle(ctx context.Context, id *httpx.Identity, articleID uuid.UUID) (ArticleResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return ArticleResponse{}, err
	}
	a, err := s.getOwned(ctx, id, articleID)
	if err != nil {
		return ArticleResponse{}, err
	}
	return s.articleResponse(ctx, a)
}

// CreateArticle creates an article at the chosen status (default draft). Requires
// cms.article.create.
func (s *Service) CreateArticle(ctx context.Context, id *httpx.Identity, req CreateArticleRequest) (ArticleResponse, error) {
	if err := s.Require(ctx, id, permCreate); err != nil {
		return ArticleResponse{}, err
	}
	status, err := s.resolveCreateStatus(ctx, id, req)
	if err != nil {
		return ArticleResponse{}, err
	}
	w, base, tagIDs, err := s.buildCreate(ctx, req)
	if err != nil {
		return ArticleResponse{}, err
	}
	allow := s.AllowSlugEdit(ctx)
	created, err := shared.PersistWithSlug(allow,
		func(slug string) (bool, error) { return s.repo.ArticleSlugExists(ctx, slug, nil) },
		base,
		func(slug string) (*Article, error) {
			w.Slug = slug
			sw, e := buildStatusWrite(status, req.PublishAt, nil, w, tagIDs)
			if e != nil {
				return nil, e
			}
			return s.repo.CreateArticle(ctx, w, id.UserID, actorRole(id), sw, tagIDs)
		},
	)
	if err != nil {
		return ArticleResponse{}, mapArticleWriteErr(err)
	}
	s.Sec(ctx).Info("cms article created", "actor", id.UserID, "article", created.ID, "status", created.Status)
	s.Record(ctx, id, articleEntry(actionCreated, created.ID, created.Title,
		map[string]any{"status": created.Status}))
	if err := s.syncPublic(ctx, created); err != nil {
		return ArticleResponse{}, err
	}
	if created.Status == ArticleStatusPublished {
		s.Revalidate(ctx, "articles", "article:"+created.Slug)
	}
	return s.articleResponse(ctx, created)
}

// resolveCreateStatus validates the requested create status against the actor's
// create-set + status-specific inputs.
func (s *Service) resolveCreateStatus(ctx context.Context, id *httpx.Identity, req CreateArticleRequest) (string, error) {
	reviewOn, schedulingOn := s.RequireReview(ctx), s.SchedulingEnabled(ctx)
	status := ArticleStatusDraft
	if req.Status != nil {
		status = *req.Status
	}
	if !allowedStatuses(s.isReviewer(id), s.isReviewer(id), true, reviewOn, schedulingOn)[status] {
		return "", apperr.Unprocessable("invalid_status_transition")
	}
	if err := validateStatusInputs(status, req.PublishAt, nil); err != nil {
		return "", err
	}
	return status, nil
}

// buildCreate validates content + builds the working write and tag set.
func (s *Service) buildCreate(ctx context.Context, req CreateArticleRequest) (articleWrite, string, []uuid.UUID, error) {
	allow := s.AllowSlugEdit(ctx)
	title := strings.TrimSpace(req.Title)
	base := shared.CreateSlugBase(allow, req.Slug, title)
	if title == "" {
		return articleWrite{}, "", nil, apperr.Validation(map[string]string{"title": "required"})
	}
	if base == "" {
		return articleWrite{}, "", nil, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	if req.CategoryID == nil && s.CategorizeRequired(ctx) {
		return articleWrite{}, "", nil, apperr.Validation(map[string]string{"category_id": "required"})
	}
	if req.CategoryID != nil {
		if err := s.assertCategoryExists(ctx, *req.CategoryID); err != nil {
			return articleWrite{}, "", nil, err
		}
	}
	if err := s.validateTags(ctx, req.TagIDs); err != nil {
		return articleWrite{}, "", nil, err
	}
	// No article id exists yet, so no media could have been uploaded to it — a
	// non-empty featured/og path can only reference another entity's file. Reject
	// (media is attached after create via upload + PATCH).
	if req.FeaturedPath != nil && *req.FeaturedPath != "" {
		return articleWrite{}, "", nil, apperr.Validation(map[string]string{"featured_path": "invalid_value"})
	}
	if req.OGPath != nil && *req.OGPath != "" {
		return articleWrite{}, "", nil, apperr.Validation(map[string]string{"og_path": "invalid_value"})
	}
	return articleWriteFrom(req), base, dedupeIDs(req.TagIDs), nil
}

// UpdateArticle patches content + (optionally) transitions status. Requires
// cms.article.edit. Editor ABAC + the status matrix apply.
func (s *Service) UpdateArticle(ctx context.Context, id *httpx.Identity, articleID uuid.UUID, req UpdateArticleRequest) (ArticleResponse, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return ArticleResponse{}, err
	}
	cur, err := s.getOwned(ctx, id, articleID)
	if err != nil {
		return ArticleResponse{}, err
	}
	reviewOn := s.RequireReview(ctx)
	if !s.isReviewer(id) && reviewOn && (cur.Status == ArticleStatusPublished || cur.Status == ArticleStatusScheduled) {
		// With review ON the editor loses control once the article is out for
		// publishing (admin owns it).
		return ArticleResponse{}, apperr.Unprocessable("invalid_status_transition")
	}
	w, err := s.buildUpdate(ctx, cur, req)
	if err != nil {
		return ArticleResponse{}, err
	}
	target, swPublishAt, swNote, err := s.resolveUpdateStatus(ctx, cur, req, s.isReviewer(id), reviewOn)
	if err != nil {
		return ArticleResponse{}, err
	}
	updated, err := s.writeArticleUpdate(ctx, articleID, w, req, statusWriteInputs{target, swPublishAt, swNote})
	if err != nil {
		return ArticleResponse{}, err
	}
	// featured/og are served from the LIVE columns (not the snapshot), so once the
	// path is replaced/cleared the old file has no reference — delete it.
	prefix := articleMediaPrefix(articleID)
	shared.DeleteOldMedia(ctx, s.files, prefix, cur.FeaturedPath, updated.FeaturedPath)
	shared.DeleteOldMedia(ctx, s.files, prefix, cur.OGPath, updated.OGPath)
	// Reclaim inline body images dropped since the last save (removed/replaced,
	// incl. upload-on-insert churn) — reconciled against the new body HTML.
	body := ""
	if updated.BodyHTML != nil {
		body = *updated.BodyHTML
	}
	s.gcInlineMedia(ctx, articleID, body)
	s.Sec(ctx).Info("cms article updated", "actor", id.UserID, "article", articleID, "from", cur.Status, "to", updated.Status)
	s.Record(ctx, id, articleEntry(updateAction(cur.Status, updated.Status), articleID, updated.Title,
		statusMeta(cur.Status, updated.Status)))
	if err := s.syncPublic(ctx, updated); err != nil {
		return ArticleResponse{}, err
	}
	// Refresh the public cache when the article is (or just stopped being) public.
	if updated.Status == ArticleStatusPublished || cur.Status == ArticleStatusPublished {
		s.Revalidate(ctx, "articles", "article:"+updated.Slug)
	}
	return s.articleResponse(ctx, updated)
}

// buildUpdate merges the PATCH onto the current row and validates content.
func (s *Service) buildUpdate(ctx context.Context, cur *Article, req UpdateArticleRequest) (articleWrite, error) {
	w := articleWriteFromCurrent(cur)
	applyArticleUpdate(&w, req)
	if w.Title == "" {
		return articleWrite{}, apperr.Validation(map[string]string{"title": "required"})
	}
	// Media paths must lie under the article's own upload folder — a client can't
	// point featured/og at (and later GC-delete) another entity's storage object.
	prefix := articleMediaPrefix(cur.ID)
	if w.FeaturedPath != nil && !shared.OwnsMedia(prefix, *w.FeaturedPath) {
		return articleWrite{}, apperr.Validation(map[string]string{"featured_path": "invalid_value"})
	}
	if w.OGPath != nil && !shared.OwnsMedia(prefix, *w.OGPath) {
		return articleWrite{}, apperr.Validation(map[string]string{"og_path": "invalid_value"})
	}
	if req.CategoryID.Set && req.CategoryID.Value != nil {
		if err := s.assertCategoryExists(ctx, *req.CategoryID.Value); err != nil {
			return articleWrite{}, err
		}
	}
	// categorize invariant (CAT-UPD): block clearing the category while the flag is ON.
	if req.CategoryID.Set && req.CategoryID.Value == nil && s.CategorizeRequired(ctx) {
		return articleWrite{}, apperr.Validation(map[string]string{"category_id": "required"})
	}
	if req.TagIDs != nil {
		if err := s.validateTags(ctx, *req.TagIDs); err != nil {
			return articleWrite{}, err
		}
	}
	return w, nil
}

// statusWriteInputs carries the resolved status transition for an update.
type statusWriteInputs struct {
	target    string
	publishAt *time.Time
	note      *string
}

// resolveUpdateStatus gates the (optional) status change by the matrix + inputs.
// A pure content edit (status unchanged) preserves the current status columns.
func (s *Service) resolveUpdateStatus(ctx context.Context, cur *Article, req UpdateArticleRequest, reviewer, reviewOn bool) (string, *time.Time, *string, error) {
	if req.Status == nil || *req.Status == cur.Status {
		return cur.Status, cur.PublishedAt, cur.ReviewNote, nil
	}
	target := *req.Status
	schedulingOn := s.SchedulingEnabled(ctx)
	if !allowedStatuses(reviewer, isReviewerRole(cur.AuthorRole), false, reviewOn, schedulingOn)[target] {
		return "", nil, nil, apperr.Unprocessable("invalid_status_transition")
	}
	if err := validateStatusInputs(target, req.PublishAt, req.Note); err != nil {
		return "", nil, nil, err
	}
	return target, req.PublishAt, req.Note, nil
}

// writeArticleUpdate applies the slug plan and persists the content + status.
func (s *Service) writeArticleUpdate(ctx context.Context, articleID uuid.UUID, w articleWrite, req UpdateArticleRequest, st statusWriteInputs) (*Article, error) {
	tagIDsForSnap, err := s.effectiveTagIDs(ctx, articleID, req.TagIDs)
	if err != nil {
		return nil, apperr.Internal()
	}
	var tagIDs *[]uuid.UUID
	if req.TagIDs != nil {
		d := dedupeIDs(*req.TagIDs)
		tagIDs = &d
	}
	allow := s.AllowSlugEdit(ctx)
	slugBase, change := shared.UpdateSlugPlan(allow, req.RegenerateSlug, req.Slug, w.Title)
	if change && slugBase == "" {
		return nil, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	write := func(slug string) (*Article, error) {
		w.Slug = slug
		sw, e := buildStatusWrite(st.target, st.publishAt, st.note, w, tagIDsForSnap)
		if e != nil {
			return nil, e
		}
		return s.repo.UpdateArticle(ctx, articleID, w, sw, *req.UpdatedAt, tagIDs)
	}
	var updated *Article
	if change {
		updated, err = shared.PersistWithSlug(allow,
			func(slug string) (bool, error) { return s.repo.ArticleSlugExists(ctx, slug, &articleID) },
			slugBase, write)
	} else {
		updated, err = write(w.Slug)
	}
	if err != nil {
		return nil, mapArticleWriteErr(err)
	}
	return updated, nil
}

// DeleteArticle removes an article. Requires cms.article.delete; editors may
// delete only their own draft.
func (s *Service) DeleteArticle(ctx context.Context, id *httpx.Identity, articleID uuid.UUID) error {
	if err := s.Require(ctx, id, permDelete); err != nil {
		return err
	}
	cur, err := s.getOwned(ctx, id, articleID)
	if err != nil {
		return err
	}
	if !s.isReviewer(id) && cur.Status != ArticleStatusDraft {
		return apperr.Unprocessable("invalid_status_transition")
	}
	if err := s.repo.DeleteArticle(ctx, articleID); err != nil {
		return apperr.Internal()
	}
	// An orphan in the public read model is not wasted space: it is a URL still
	// serving an article that no longer exists. Same for the translation store.
	if s.pub != nil {
		if err := s.pub.Purge(ctx, EntityArticle, articleID); err != nil {
			s.Sec(ctx).Error("purge public doc", "article", articleID, "error", err)
			return apperr.Internal()
		}
	}
	if s.tr != nil {
		if err := s.tr.Purge(ctx, EntityArticle, articleID); err != nil {
			s.Sec(ctx).Warn("purge article translations failed", "article", articleID, "err", err)
		}
	}
	// Reclaim the article's whole media folder (featured/og + any mid-edit
	// uploads) — the row is gone, so nothing references it. Best-effort.
	if err := shared.PurgeMediaTree(ctx, s.files, "cms/articles/"+articleID.String()+"/"); err != nil {
		s.Sec(ctx).Warn("cms article media purge failed", "article", articleID, "err", err)
	}
	s.Sec(ctx).Info("cms article deleted", "actor", id.UserID, "article", articleID)
	// Titled from the row read at the top of this method: by now there is nothing
	// left to resolve the id against.
	s.Record(ctx, id, articleEntry(actionDeleted, articleID, cur.Title,
		map[string]any{"status": cur.Status}))
	return nil
}
