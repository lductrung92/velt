package categories

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/localize"
	"github.com/velt/backend/internal/platform/slug"
)

// Service holds the product-category business rules.
type Service struct {
	*shared.Base
	repo Repository
	tr   Translator
}

// NewService wires the category service onto the shared products base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// --- Reads ---

// List returns the whole taxonomy for the console. Requires products.view.
//
// locale is the language the console is reading in (Accept-Language), "" for
// the source language: the names come back translated where somebody has
// written a translation, and in Vietnamese where nobody has.
//
// status narrows the list to one status; empty means the whole taxonomy.
func (s *Service) List(ctx context.Context, id *httpx.Identity, locale, status string) (ListResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return ListResponse{}, err
	}
	if status != "" && !validStatus[status] {
		return ListResponse{}, apperr.Validation(map[string]string{"status": "invalid_value"})
	}
	res, err := s.list(ctx, status)
	if err != nil {
		return ListResponse{}, err
	}
	ids := make([]uuid.UUID, 0, len(res.Items))
	for _, c := range res.Items {
		ids = append(ids, c.ID)
	}
	// One lookup for the whole taxonomy, however long it is. The translation
	// lands in NameDisplay and never in Name — see the field's own comment.
	tr := localize.Fields(ctx, s.tr, EntityCategory, locale, ids)
	for i := range res.Items {
		res.Items[i].NameDisplay = localize.Str(
			tr[res.Items[i].ID], "name", res.Items[i].Name)
	}
	return res, nil
}

// list is the shared read. Every caller must gate it first — List does, and
// nothing in this package exposes it without an identity.
func (s *Service) list(ctx context.Context, status string) (ListResponse, error) {
	rows, err := s.repo.List(ctx, status)
	if err != nil {
		return ListResponse{}, s.MapRepoErr(ctx, "list categories", err)
	}
	items := make([]Response, 0, len(rows))
	for _, c := range rows {
		items = append(items, toResponse(c))
	}
	return ListResponse{Items: items}, nil
}

// --- Writes ---

// Create adds a category. Requires products.category.manage.
func (s *Service) Create(ctx context.Context, id *httpx.Identity, req CreateRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return Response{}, apperr.Validation(map[string]string{"name": "required"})
	}
	resolved, err := s.resolveSlug(ctx, req.Slug, name, nil)
	if err != nil {
		return Response{}, err
	}
	w := write{
		Slug:        resolved,
		Name:        name,
		Description: trimPtr(req.Description),
		Status:      derefStatus(req.Status),
		SortOrder:   req.SortOrder, // nil → repository appends to the end
	}
	applySEO(&w, req.SEO)
	c, err := s.repo.Create(ctx, w)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "create category", err)
	}
	s.Record(ctx, id, categoryEntry(actionCreated, c.ID, c.Name, nil))
	return toResponse(*c), nil
}

// Update applies a PATCH onto the current row. Requires products.category.manage.
func (s *Service) Update(ctx context.Context, id *httpx.Identity, catID uuid.UUID, req UpdateRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, catID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "update category: load", err)
	}

	name := cur.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			return Response{}, apperr.Validation(map[string]string{"name": "required"})
		}
	}

	resolved := cur.Slug
	if req.Slug != nil {
		resolved, err = s.resolveSlug(ctx, req.Slug, name, &catID)
		if err != nil {
			return Response{}, err
		}
	}

	sortOrder := cur.SortOrder
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}
	status := cur.Status
	if req.Status != nil {
		status = *req.Status
	}
	w := write{
		Slug:           resolved,
		Name:           name,
		Description:    cur.Description,
		Status:         status,
		SEOTitle:       cur.SEOTitle,
		SEODescription: cur.SEODescription,
		SEOKeywords:    cur.SEOKeywords,
		SortOrder:      &sortOrder,
	}
	if req.Description != nil {
		w.Description = trimPtr(req.Description)
	}
	// An omitted `seo` object leaves every meta field alone; a present one
	// replaces all three, so clearing a single field is just sending it empty.
	applySEO(&w, req.SEO)

	c, err := s.repo.Update(ctx, catID, w)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "update category", err)
	}
	s.Record(ctx, id, categoryEntry(actionUpdated, catID, c.Name, nil))
	return toResponse(*c), nil
}

// Delete removes a category.
//
// It is NOT blocked when products still use it: the link rows cascade away, and
// a product with no category is a valid state. The console shows how many
// products are affected before asking for confirmation.
func (s *Service) Delete(ctx context.Context, id *httpx.Identity, catID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	// Read before the delete: the name has to outlive the row it came from, and
	// the product links cascade away with it.
	cur, err := s.repo.Get(ctx, catID)
	if err != nil {
		return s.MapRepoErr(ctx, "delete category: load", err)
	}
	if err := s.repo.Delete(ctx, catID); err != nil {
		return s.MapRepoErr(ctx, "delete category", err)
	}
	s.purgeTranslations(ctx, catID)
	s.Record(ctx, id, categoryEntry(actionDeleted, catID, cur.Name,
		map[string]any{"products": cur.ProductCount}))
	return nil
}

// Reorder rewrites the taxonomy display order. Requires products.category.manage.
func (s *Service) Reorder(ctx context.Context, id *httpx.Identity, ids []uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	for _, i := range ids {
		if _, dup := seen[i]; dup {
			return apperr.Validation(map[string]string{"ids": "duplicate"})
		}
		seen[i] = struct{}{}
	}
	if err := s.repo.Reorder(ctx, ids); err != nil {
		return s.MapRepoErr(ctx, "reorder categories", err)
	}
	return nil
}

// --- Helpers ---

// resolveSlug normalises the requested slug (or derives one from the name) and
// makes it unique by suffixing -01, -02, … A category slug appears in public
// filter URLs, so a collision must not surface as an error the admin has to
// resolve by hand.
func (s *Service) resolveSlug(ctx context.Context, provided *string, name string, excludeID *uuid.UUID) (string, error) {
	base := ""
	if provided != nil {
		base = slug.Make(*provided)
	}
	if base == "" {
		base = slug.Make(name)
	}
	if base == "" {
		// Name was punctuation/emoji only — nothing usable to build a URL from.
		return "", apperr.Validation(map[string]string{"slug": "invalid"})
	}
	out, err := slug.Unique(func(cand string) (bool, error) {
		return s.repo.SlugExists(ctx, cand, excludeID)
	}, base)
	if err != nil {
		s.Sec(ctx).Error("products: resolve category slug", "err", err)
		return "", apperr.Internal()
	}
	return out, nil
}

// applySEO copies a present SEO sub-object onto the write, trimming each field
// (empty → NULL). A nil sub-object is a no-op.
func applySEO(w *write, seo *CategorySEO) {
	if seo == nil {
		return
	}
	w.SEOTitle = trimPtr(seo.Title)
	w.SEODescription = trimPtr(seo.Description)
	w.SEOKeywords = trimPtr(seo.Keywords)
}

func toResponse(c Category) Response {
	return Response{
		// NameDisplay starts as the stored name: a response that is never
		// localized — a create, an update — still has something to show, and a
		// caller reading only the display field is never handed a blank.
		ID: c.ID, Slug: c.Slug, Name: c.Name, NameDisplay: c.Name,
		Description: c.Description,
		SortOrder:   c.SortOrder, Status: c.Status, ProductCount: c.ProductCount,
		SEO: CategorySEO{
			Title:       c.SEOTitle,
			Description: c.SEODescription,
			Keywords:    c.SEOKeywords,
		},
		CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
	}
}

// derefStatus is the create-time status: what was asked for, or published —
// a category that has just been made is in use, which is also what every row
// that predates the status column means.
func derefStatus(v *string) string {
	if v == nil {
		return StatusPublished
	}
	return *v
}

func trimPtr(v *string) *string {
	if v == nil {
		return nil
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return nil
	}
	return &t
}
