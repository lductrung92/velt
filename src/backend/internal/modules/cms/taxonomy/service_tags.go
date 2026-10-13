package taxonomy

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// ListTags returns a paginated tag list with article usage counts, optionally
// filtered by name/slug. Requires cms.article.view.
func (s *Service) ListTags(ctx context.Context, id *httpx.Identity, p TagListParams) (TagListResult, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return TagListResult{}, err
	}
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 || p.PageSize > maxTagPageSize {
		p.PageSize = 20
	}
	rows, total, err := s.repo.ListTagsWithCounts(ctx, p)
	if err != nil {
		return TagListResult{}, apperr.Internal()
	}
	items := make([]TagResponse, 0, len(rows))
	for _, t := range rows {
		items = append(items, toTagResponse(t))
	}
	return TagListResult{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// ListTagOptions returns every tag (id/name/slug) for selectors that need the
// full set (merge target, article-list filter). Requires cms.article.view.
func (s *Service) ListTagOptions(ctx context.Context, id *httpx.Identity) ([]TagOption, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return nil, err
	}
	rows, err := s.repo.ListTagOptions(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	out := make([]TagOption, 0, len(rows))
	for _, t := range rows {
		out = append(out, toTagOption(t))
	}
	return out, nil
}

// CreateTag creates a tag. Requires cms.taxonomy.manage.
func (s *Service) CreateTag(ctx context.Context, id *httpx.Identity, req CreateTagRequest) (TagResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return TagResponse{}, err
	}
	allow := s.AllowSlugEdit(ctx)
	name := strings.TrimSpace(req.Name)
	base := shared.CreateSlugBase(allow, req.Slug, name)
	if name == "" {
		return TagResponse{}, apperr.Validation(map[string]string{"name": "required"})
	}
	if base == "" {
		return TagResponse{}, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	// Manual-edit ON → reject collision; OFF → auto-suffix `-NN` (business-rules §1).
	created, err := shared.PersistWithSlug(allow,
		func(slug string) (bool, error) { return s.repo.TagSlugExists(ctx, slug, nil) },
		base,
		func(slug string) (*Tag, error) { return s.repo.CreateTag(ctx, name, slug) },
	)
	if allow && errors.Is(err, shared.ErrConflict) {
		return TagResponse{}, apperr.Unprocessable("slug_already_exists")
	}
	if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms tag created", "actor", id.UserID, "tag", created.ID)
	s.Record(ctx, id, taxonomyEntry(actionTagCreated, EntityTag, created.ID, created.Name, nil))
	return toTagResponse(tagWithCount{Tag: *created, UsageCount: 0}), nil
}

// UpdateTag patches a tag (name and/or slug). Requires cms.taxonomy.manage.
func (s *Service) UpdateTag(ctx context.Context, id *httpx.Identity, tagID uuid.UUID, req UpdateTagRequest) (TagResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return TagResponse{}, err
	}
	cur, err := s.repo.GetTag(ctx, tagID)
	if errors.Is(err, shared.ErrNotFound) {
		return TagResponse{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	name := cur.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	if name == "" {
		return TagResponse{}, apperr.Validation(map[string]string{"name": "required"})
	}
	// Slug change depends on the manual-edit flag (business-rules §1).
	allow := s.AllowSlugEdit(ctx)
	slugBase, change := shared.UpdateSlugPlan(allow, req.RegenerateSlug, req.Slug, name)
	if change && slugBase == "" {
		return TagResponse{}, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}

	write := func(slug string) (*Tag, error) { return s.repo.UpdateTag(ctx, tagID, name, slug) }
	var updated *Tag
	if change {
		updated, err = shared.PersistWithSlug(allow,
			func(slug string) (bool, error) { return s.repo.TagSlugExists(ctx, slug, &tagID) },
			slugBase, write,
		)
		if allow && errors.Is(err, shared.ErrConflict) {
			return TagResponse{}, apperr.Unprocessable("slug_already_exists")
		}
	} else {
		updated, err = write(cur.Slug)
	}
	if errors.Is(err, shared.ErrNotFound) {
		return TagResponse{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	count, err := s.repo.TagUsageCount(ctx, tagID)
	if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms tag updated", "actor", id.UserID, "tag", tagID)
	s.Record(ctx, id, taxonomyEntry(actionTagUpdated, EntityTag, tagID, updated.Name, nil))
	return toTagResponse(tagWithCount{Tag: *updated, UsageCount: count}), nil
}

// DeleteTag removes a tag (its article associations cascade away). Requires
// cms.taxonomy.manage.
func (s *Service) DeleteTag(ctx context.Context, id *httpx.Identity, tagID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	// Read before the delete: the name has to outlive the row it came from.
	cur, err := s.repo.GetTag(ctx, tagID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	if err := s.repo.DeleteTag(ctx, tagID); err != nil {
		return apperr.Internal()
	}
	s.purgeTranslations(ctx, EntityTag, tagID)
	s.Sec(ctx).Info("cms tag deleted", "actor", id.UserID, "tag", tagID)
	s.Record(ctx, id, taxonomyEntry(actionTagDeleted, EntityTag, tagID, cur.Name, nil))
	return nil
}

// MergeTags moves source's article associations onto target and deletes source.
// Requires cms.taxonomy.manage. Returns the surviving target tag.
func (s *Service) MergeTags(ctx context.Context, id *httpx.Identity, req MergeTagsRequest) (TagResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return TagResponse{}, err
	}
	if req.SourceID == req.TargetID {
		return TagResponse{}, apperr.Validation(map[string]string{"target_id": "invalid_value"})
	}
	// The source tag is read rather than probed: the merge deletes it, and its
	// name is what the activity row has to carry afterwards.
	source, err := s.repo.GetTag(ctx, req.SourceID)
	if errors.Is(err, shared.ErrNotFound) {
		return TagResponse{}, apperr.Validation(map[string]string{"source_id": "not_found"})
	} else if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	if ok, err := s.repo.TagExists(ctx, req.TargetID); err != nil {
		return TagResponse{}, apperr.Internal()
	} else if !ok {
		return TagResponse{}, apperr.Validation(map[string]string{"target_id": "not_found"})
	}
	if err := s.repo.MergeTags(ctx, req.SourceID, req.TargetID); err != nil {
		return TagResponse{}, apperr.Internal()
	}
	// A merge deletes the source tag, so its translations go the same way as on
	// a plain delete. The target keeps its own.
	s.purgeTranslations(ctx, EntityTag, req.SourceID)
	s.Sec(ctx).Info("cms tags merged", "actor", id.UserID, "source", req.SourceID, "target", req.TargetID)

	target, err := s.repo.GetTag(ctx, req.TargetID)
	if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	// The row points at the surviving tag: that is what a reader can still open.
	s.Record(ctx, id, taxonomyEntry(actionTagMerged, EntityTag, target.ID, target.Name,
		map[string]any{"source_id": req.SourceID, "source": source.Name}))
	count, err := s.repo.TagUsageCount(ctx, req.TargetID)
	if err != nil {
		return TagResponse{}, apperr.Internal()
	}
	return toTagResponse(tagWithCount{Tag: *target, UsageCount: count}), nil
}
