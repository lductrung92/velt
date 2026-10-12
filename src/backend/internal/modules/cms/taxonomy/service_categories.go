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

// ListCategories returns the full category tree with article counts. Requires
// cms.article.view.
func (s *Service) ListCategories(ctx context.Context, id *httpx.Identity) ([]CategoryResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return nil, err
	}
	rows, err := s.repo.ListCategoriesWithCounts(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	return buildCategoryTree(rows), nil
}

// CreateCategory creates a category. Requires cms.taxonomy.manage.
func (s *Service) CreateCategory(ctx context.Context, id *httpx.Identity, req CreateCategoryRequest) (CategoryResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return CategoryResponse{}, err
	}
	allow := s.AllowSlugEdit(ctx)
	name := strings.TrimSpace(req.Name)
	base := shared.CreateSlugBase(allow, req.Slug, name)
	if name == "" {
		return CategoryResponse{}, apperr.Validation(map[string]string{"name": "required"})
	}
	if base == "" { // name had no sluggable chars and no explicit slug given
		return CategoryResponse{}, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	if req.ParentID != nil {
		if err := s.assertCategoryExists(ctx, *req.ParentID); err != nil {
			return CategoryResponse{}, err
		}
	}
	w := categoryWrite{
		Name: name, ParentID: req.ParentID,
		Description: req.Description, SortOrder: derefInt(req.SortOrder),
	}
	w.SEOTitle, w.SEODescription, w.SEOKeywords = seoFields(req.SEO)

	// Manual-edit ON → reject collision; OFF → auto-suffix `-NN` (business-rules §1).
	created, err := shared.PersistWithSlug(allow,
		func(slug string) (bool, error) { return s.repo.CategorySlugExists(ctx, slug, nil) },
		base,
		func(slug string) (*Category, error) { w.Slug = slug; return s.repo.CreateCategory(ctx, w) },
	)
	if allow && errors.Is(err, shared.ErrConflict) {
		return CategoryResponse{}, apperr.Unprocessable("slug_already_exists")
	}
	if errors.Is(err, shared.ErrParentMissing) {
		// Race: parent deleted between assertCategoryExists and insert (FK 23503).
		return CategoryResponse{}, apperr.Validation(map[string]string{"parent_id": "not_found"})
	}
	if err != nil {
		return CategoryResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms category created", "actor", id.UserID, "category", created.ID)
	return categoryDetail(*created, 0), nil
}

// UpdateCategory patches a category (incl. moving it in the tree). Requires
// cms.taxonomy.manage.
func (s *Service) UpdateCategory(ctx context.Context, id *httpx.Identity, catID uuid.UUID, req UpdateCategoryRequest) (CategoryResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return CategoryResponse{}, err
	}
	cur, err := s.repo.GetCategory(ctx, catID)
	if errors.Is(err, shared.ErrNotFound) {
		return CategoryResponse{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return CategoryResponse{}, apperr.Internal()
	}

	w := mergeCategoryWrite(cur, req)
	if w.Name == "" {
		return CategoryResponse{}, apperr.Validation(map[string]string{"name": "required"})
	}
	if req.ParentID.Set {
		if err := s.resolveParentMove(ctx, catID, req.ParentID.Value); err != nil {
			return CategoryResponse{}, err
		}
		w.ParentID = req.ParentID.Value
	}
	// Re-check the cycle inside the UPDATE transaction only for a real move to a
	// non-root parent (the fast pre-check above is best-effort; the tx guards TOCTOU).
	recheckCycle := req.ParentID.Set && req.ParentID.Value != nil

	updated, err := s.writeCategoryUpdate(ctx, catID, w, req, recheckCycle)
	if err != nil {
		return CategoryResponse{}, err
	}
	count, err := s.repo.CategoryArticleCount(ctx, catID)
	if err != nil {
		return CategoryResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms category updated", "actor", id.UserID, "category", catID)
	return categoryDetail(*updated, count), nil
}

// writeCategoryUpdate applies the slug plan (business-rules §1) and persists the
// update, mapping every repo outcome to an AppError.
func (s *Service) writeCategoryUpdate(ctx context.Context, catID uuid.UUID, w categoryWrite, req UpdateCategoryRequest, recheckCycle bool) (*Category, error) {
	allow := s.AllowSlugEdit(ctx)
	slugBase, change := shared.UpdateSlugPlan(allow, req.RegenerateSlug, req.Slug, w.Name)
	if change && slugBase == "" {
		return nil, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	write := func(slug string) (*Category, error) {
		w.Slug = slug
		return s.repo.UpdateCategory(ctx, catID, w, *req.UpdatedAt, recheckCycle)
	}
	var updated *Category
	var err error
	if change {
		updated, err = shared.PersistWithSlug(allow,
			func(slug string) (bool, error) { return s.repo.CategorySlugExists(ctx, slug, &catID) },
			slugBase, write,
		)
		if allow && errors.Is(err, shared.ErrConflict) {
			return nil, apperr.Unprocessable("slug_already_exists")
		}
	} else {
		updated, err = write(w.Slug)
	}
	switch {
	case errors.Is(err, shared.ErrCategoryCycle):
		return nil, apperr.Unprocessable("category_cycle")
	case errors.Is(err, shared.ErrOptLock):
		return nil, apperr.Conflict("conflict")
	case errors.Is(err, shared.ErrNotFound):
		return nil, apperr.NotFound("not_found")
	case err != nil:
		return nil, apperr.Internal()
	}
	return updated, nil
}

// DeleteCategory removes a category with no children and no articles. Requires
// cms.taxonomy.manage.
func (s *Service) DeleteCategory(ctx context.Context, id *httpx.Identity, catID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	if _, err := s.repo.GetCategory(ctx, catID); errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	hasChildren, err := s.repo.CategoryHasChildren(ctx, catID)
	if err != nil {
		return apperr.Internal()
	}
	count, err := s.repo.CategoryArticleCount(ctx, catID)
	if err != nil {
		return apperr.Internal()
	}
	if hasChildren || count > 0 {
		return apperr.Conflict("category_in_use")
	}
	if err := s.repo.DeleteCategory(ctx, catID); errors.Is(err, shared.ErrInUse) {
		return apperr.Conflict("category_in_use")
	} else if err != nil {
		return apperr.Internal()
	}
	s.purgeTranslations(ctx, EntityCategory, catID)
	s.Sec(ctx).Info("cms category deleted", "actor", id.UserID, "category", catID)
	return nil
}

// assertCategoryExists maps a missing parent to an inline validation error.
func (s *Service) assertCategoryExists(ctx context.Context, id uuid.UUID) error {
	if _, err := s.repo.GetCategory(ctx, id); errors.Is(err, shared.ErrNotFound) {
		return apperr.Validation(map[string]string{"parent_id": "not_found"})
	} else if err != nil {
		return apperr.Internal()
	}
	return nil
}

// resolveParentMove validates a category move: a nil parent (move to root) is
// always allowed; otherwise the parent must exist and the move must not create a
// cycle (parent == self or a descendant of self → 422 category_cycle).
func (s *Service) resolveParentMove(ctx context.Context, catID uuid.UUID, newParent *uuid.UUID) error {
	if newParent == nil {
		return nil
	}
	if *newParent == catID {
		return apperr.Unprocessable("category_cycle")
	}
	if err := s.assertCategoryExists(ctx, *newParent); err != nil {
		return err
	}
	cycles, err := s.repo.CategoryCreatesCycle(ctx, catID, *newParent)
	if err != nil {
		return apperr.Internal()
	}
	if cycles {
		return apperr.Unprocessable("category_cycle")
	}
	return nil
}

// mergeCategoryWrite folds a PATCH request onto the current row, producing the
// full write state (the repo does a plain full-row UPDATE).
func mergeCategoryWrite(cur *Category, req UpdateCategoryRequest) categoryWrite {
	w := categoryWrite{
		Name: cur.Name, Slug: cur.Slug, ParentID: cur.ParentID,
		Description: cur.Description, SortOrder: cur.SortOrder,
		SEOTitle: cur.SEOTitle, SEODescription: cur.SEODescription, SEOKeywords: cur.SEOKeywords,
	}
	if req.Name != nil {
		w.Name = strings.TrimSpace(*req.Name)
	}
	if req.Description != nil {
		w.Description = req.Description
	}
	if req.SortOrder != nil {
		w.SortOrder = *req.SortOrder
	}
	if req.SEO != nil {
		w.SEOTitle, w.SEODescription, w.SEOKeywords = seoFields(req.SEO)
	}
	return w
}

func categoryDetail(c Category, articleCount int) CategoryResponse {
	return toCategoryResponse(categoryWithCount{Category: c, ArticleCount: articleCount})
}

// buildCategoryTree assembles the flat (pre-ordered) rows into a nested tree.
func buildCategoryTree(rows []categoryWithCount) []CategoryResponse {
	type node struct {
		resp     CategoryResponse
		children []*node
	}
	byID := make(map[uuid.UUID]*node, len(rows))
	for _, r := range rows {
		byID[r.ID] = &node{resp: toCategoryResponse(r)}
	}
	roots := []*node{}
	for _, r := range rows {
		n := byID[r.ID]
		if r.ParentID != nil {
			if p, ok := byID[*r.ParentID]; ok {
				p.children = append(p.children, n)
				continue
			}
		}
		roots = append(roots, n)
	}
	var materialize func(n *node) CategoryResponse
	materialize = func(n *node) CategoryResponse {
		out := n.resp
		out.Children = make([]CategoryResponse, 0, len(n.children))
		for _, c := range n.children {
			out.Children = append(out.Children, materialize(c))
		}
		return out
	}
	result := make([]CategoryResponse, 0, len(roots))
	for _, n := range roots {
		result = append(result, materialize(n))
	}
	return result
}
