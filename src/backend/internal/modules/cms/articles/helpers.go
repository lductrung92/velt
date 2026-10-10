package articles

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/htmlsan"
)

// validateStatusInputs rejects missing status-specific inputs early (before the
// slug retry loop): scheduled needs a future publish_at; needs_revision a note.
func validateStatusInputs(status string, publishAt *time.Time, note *string) error {
	switch status {
	case ArticleStatusScheduled:
		if publishAt == nil || !publishAt.After(time.Now()) {
			return apperr.Validation(map[string]string{"publish_at": "required"})
		}
	case ArticleStatusNeedsRevision:
		if note == nil || strings.TrimSpace(*note) == "" {
			return apperr.Validation(map[string]string{"note": "required"})
		}
	}
	return nil
}

// buildStatusWrite assembles the repo status payload once the slug is final.
func buildStatusWrite(status string, publishAt *time.Time, note *string, w articleWrite, tagIDs []uuid.UUID) (articleStatusWrite, error) {
	sw := articleStatusWrite{Status: status}
	switch status {
	case ArticleStatusScheduled:
		sw.PublishAt = publishAt
	case ArticleStatusNeedsRevision:
		sw.ReviewNote = note
	case ArticleStatusPublished:
		now := time.Now()
		snap, err := json.Marshal(articleSnapshot{
			Title: w.Title, Slug: w.Slug, Excerpt: w.Excerpt, BodyHTML: w.BodyHTML,
			FeaturedPath: w.FeaturedPath, CategoryID: w.CategoryID, TagIDs: tagIDs,
			PublishedAt: &now, SEO: articleWriteSEO(w), OGPath: w.OGPath,
		})
		if err != nil {
			return sw, err
		}
		sw.Snapshot = snap
	}
	return sw, nil
}

// effectiveTagIDs resolves the tag set used for a publish snapshot: the new set
// when the request changes tags, else the article's current tags.
func (s *Service) effectiveTagIDs(ctx context.Context, articleID uuid.UUID, reqTags *[]uuid.UUID) ([]uuid.UUID, error) {
	if reqTags != nil {
		return dedupeIDs(*reqTags), nil
	}
	tags, err := s.repo.ArticleTags(ctx, articleID)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(tags))
	for i, t := range tags {
		ids[i] = t.ID
	}
	return ids, nil
}

func (s *Service) assertCategoryExists(ctx context.Context, catID uuid.UUID) error {
	ok, err := s.repo.CategoryExists(ctx, catID)
	if err != nil {
		return apperr.Internal()
	}
	if !ok {
		return apperr.Validation(map[string]string{"category_id": "not_found"})
	}
	return nil
}

// validateTags ensures every referenced tag exists (one query); missing → 422.
func (s *Service) validateTags(ctx context.Context, ids []uuid.UUID) error {
	ids = dedupeIDs(ids)
	if len(ids) == 0 {
		return nil
	}
	n, err := s.repo.CountTags(ctx, ids)
	if err != nil {
		return apperr.Internal()
	}
	if n != len(ids) {
		return apperr.Validation(map[string]string{"tag_ids": "not_found"})
	}
	return nil
}

// articleResponse loads tags + resolves media URLs into the detail DTO.
func (s *Service) articleResponse(ctx context.Context, a *Article) (ArticleResponse, error) {
	tags, err := s.repo.ArticleTags(ctx, a.ID)
	if err != nil {
		return ArticleResponse{}, apperr.Internal()
	}
	author, category, err := s.repo.ResolveArticleRefs(ctx, a.AuthorID, a.CategoryID)
	if err != nil {
		return ArticleResponse{}, apperr.Internal()
	}
	resp := ArticleResponse{
		ArticleListItem: ArticleListItem{
			ID: a.ID, Title: a.Title, Slug: a.Slug, Status: a.Status,
			Category: category, Author: author, PublishedAt: a.PublishedAt, UpdatedAt: a.UpdatedAt,
		},
		Excerpt: a.Excerpt, BodyHTML: a.BodyHTML, BodyJSON: a.BodyJSON, Tags: tags,
		FeaturedURL: s.mediaURL(ctx, a.FeaturedPath), OGURL: s.mediaURL(ctx, a.OGPath),
		SEO: articleSEOObj(*a), ReviewNote: a.ReviewNote, AuthorRole: a.AuthorRole,
		PublishedSnapshot: a.PublishedSnapshot, CreatedAt: a.CreatedAt,
	}
	return resp, nil
}

func (s *Service) mediaURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := s.files.URL(ctx, *path)
	return &u
}

// articleWriteFrom builds the working content from a create request.
func articleWriteFrom(req CreateArticleRequest) articleWrite {
	w := articleWrite{
		Title: strings.TrimSpace(req.Title), Excerpt: req.Excerpt, CategoryID: req.CategoryID,
		BodyHTML: sanitizeBody(req.BodyHTML), BodyJSON: req.BodyJSON,
		FeaturedPath: req.FeaturedPath, OGPath: req.OGPath,
	}
	applyArticleSEO(&w, req.SEO)
	return w
}

// articleWriteFromCurrent seeds the working content from the existing row.
func articleWriteFromCurrent(cur *Article) articleWrite {
	return articleWrite{
		Title: cur.Title, Slug: cur.Slug, Excerpt: cur.Excerpt, BodyHTML: cur.BodyHTML, BodyJSON: cur.BodyJSON,
		CategoryID: cur.CategoryID, FeaturedPath: cur.FeaturedPath, OGPath: cur.OGPath,
		SEOTitle: cur.SEOTitle, SEODescription: cur.SEODescription, SEOKeywords: cur.SEOKeywords,
		CanonicalURL: cur.CanonicalURL, SEONoindex: cur.SEONoindex, SEONofollow: cur.SEONofollow,
		OGTitle: cur.OGTitle, OGDescription: cur.OGDescription,
	}
}

// applyArticleUpdate overlays the PATCH fields onto the working content.
func applyArticleUpdate(w *articleWrite, req UpdateArticleRequest) {
	if req.Title != nil {
		w.Title = strings.TrimSpace(*req.Title)
	}
	if req.Excerpt != nil {
		w.Excerpt = req.Excerpt
	}
	if req.BodyHTML != nil {
		w.BodyHTML = sanitizeBody(req.BodyHTML)
	}
	if req.BodyJSON != nil {
		w.BodyJSON = req.BodyJSON
	}
	if req.FeaturedPath != nil {
		w.FeaturedPath = req.FeaturedPath
	}
	if req.OGPath != nil {
		w.OGPath = req.OGPath
	}
	if req.SEO != nil {
		applyArticleSEO(w, req.SEO)
	}
	if req.CategoryID.Set {
		w.CategoryID = req.CategoryID.Value
	}
}

func applyArticleSEO(w *articleWrite, seo *shared.PageSEO) {
	if seo == nil {
		return
	}
	// Sanitize on write: strip markup from text fields; drop an unsafe canonical
	// (non-http/relative) so it can't carry a javascript:/data: scheme.
	if err := seo.Clean(); err != nil {
		seo.CanonicalURL = nil
	}
	w.SEOTitle = seo.Title
	w.SEODescription = seo.Description
	w.SEOKeywords = seo.Keywords
	w.CanonicalURL = seo.CanonicalURL
	w.SEONoindex = seo.NoIndex
	w.SEONofollow = seo.NoFollow
	w.OGTitle = seo.OGTitle
	w.OGDescription = seo.OGDescription
}

func articleWriteSEO(w articleWrite) shared.PageSEO {
	return shared.PageSEO{
		Title: w.SEOTitle, Description: w.SEODescription, Keywords: w.SEOKeywords,
		CanonicalURL: w.CanonicalURL, NoIndex: w.SEONoindex, NoFollow: w.SEONofollow,
		OGTitle: w.OGTitle, OGDescription: w.OGDescription,
	}
}

// sanitizeBody runs admin-authored body HTML through the allowlist sanitizer.
func sanitizeBody(html *string) *string {
	if html == nil {
		return nil
	}
	clean := htmlsan.Body(*html)
	return &clean
}

func dedupeIDs(ids []uuid.UUID) []uuid.UUID {
	if len(ids) == 0 {
		return nil
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
