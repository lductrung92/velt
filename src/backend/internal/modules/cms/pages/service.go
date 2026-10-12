package pages

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/htmlsan"
)

// LandingAdminPort drives the landing attached to a page through the page's own
// lifecycle: created with the page (kind=landing), published/unpublished with the
// page, deleted with the page. Satisfied in-process by landing.PagesPort;
// declared here so pages does not import the landing package. A nil port
// disables the cascade (tests / wiring without landing).
type LandingAdminPort interface {
	CreateDraft(ctx context.Context, name, key string) (uuid.UUID, error)
	Delete(ctx context.Context, id uuid.UUID) error
	Publish(ctx context.Context, id uuid.UUID) error
	Unpublish(ctx context.Context, id uuid.UUID) error
}

// Service holds static-page business logic.
type Service struct {
	*shared.Base
	repo    Repository
	landing LandingAdminPort // nil-safe: cascade skipped when absent
	// pub and tr are wired after construction (see public_sync.go) and are both
	// allowed to stay nil, which is what this module looked like before the
	// public read model and translations existed.
	pub publicDocWriter
	tr  Translator
}

// NewService wires the pages service onto the shared CMS base. landing may be
// nil (no landing cascade).
func NewService(base *shared.Base, repo Repository, landing LandingAdminPort) *Service {
	return &Service{Base: base, repo: repo, landing: landing}
}

// ListPages returns the full page tree (no pagination). Requires cms.page.view.
func (s *Service) ListPages(ctx context.Context, id *httpx.Identity) ([]PageResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return nil, err
	}
	rows, err := s.repo.ListPages(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	return buildPageTree(rows), nil
}

// GetPage returns one page (full working copy + snapshot). Requires cms.page.view.
func (s *Service) GetPage(ctx context.Context, id *httpx.Identity, pageID uuid.UUID) (PageDetailResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return PageDetailResponse{}, err
	}
	p, err := s.repo.GetPage(ctx, pageID)
	if err != nil {
		return PageDetailResponse{}, mapGetErr(err)
	}
	return toPageDetail(*p), nil
}

// CreatePage creates a page (status defaults to draft). Requires cms.page.create.
func (s *Service) CreatePage(ctx context.Context, id *httpx.Identity, req CreatePageRequest) (PageDetailResponse, error) {
	if err := s.Require(ctx, id, permCreate); err != nil {
		return PageDetailResponse{}, err
	}
	allow := s.AllowSlugEdit(ctx)
	title := strings.TrimSpace(req.Title)
	base := shared.CreateSlugBase(allow, req.Slug, title)
	if title == "" {
		return PageDetailResponse{}, apperr.Validation(map[string]string{"title": "required"})
	}
	if base == "" {
		return PageDetailResponse{}, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	if req.ParentID != nil {
		if err := s.assertPageExists(ctx, *req.ParentID); err != nil {
			return PageDetailResponse{}, err
		}
	}
	w := pageWrite{
		Title: title, ParentID: req.ParentID, SortOrder: derefInt(req.SortOrder),
		Template: req.Template, OGPath: req.OGPath, LandingID: req.LandingID,
		BodyHTML: sanitizeBody(req.BodyHTML), BodyJSON: req.BodyJSON,
	}
	applyPageSEO(&w, req.SEO)

	// kind=landing → the page owns a landing design: create an empty draft landing
	// (name = title, key from the slug base) and attach it. The landing lives and
	// dies with the page (delete/publish cascade below).
	if req.Kind == PageKindLanding {
		if s.landing == nil {
			return PageDetailResponse{}, apperr.Internal()
		}
		landingID, err := s.landing.CreateDraft(ctx, title, base)
		if err != nil {
			s.Sec(ctx).Error("cms page: create attached landing failed", "err", err)
			return PageDetailResponse{}, apperr.Internal()
		}
		w.LandingID = &landingID
	}

	// Manual-edit ON → reject collision; OFF → auto-suffix `-NN`. Slugs unique per
	// parent (business-rules §1).
	created, err := shared.PersistWithSlug(allow,
		func(slug string) (bool, error) { return s.repo.PageSlugExists(ctx, slug, w.ParentID, nil) },
		base,
		func(slug string) (*Page, error) { w.Slug = slug; return s.repo.CreatePage(ctx, w) },
	)
	if err != nil {
		// Roll back the just-created landing so a failed page create leaves no
		// orphan design (best-effort — an orphan here is invisible but harmless).
		if req.Kind == PageKindLanding && w.LandingID != nil {
			if e := s.landing.Delete(ctx, *w.LandingID); e != nil {
				s.Sec(ctx).Error("cms page: rollback attached landing failed", "landing", *w.LandingID, "err", e)
			}
		}
		return PageDetailResponse{}, mapWriteErr(err)
	}
	s.Sec(ctx).Info("cms page created", "actor", id.UserID, "page", created.ID, "kind", req.Kind)
	// A new page is always a draft, so this only ever asserts "nothing public
	// here". It is called anyway so that every write path leaves the read model
	// in step without the reader having to prove which ones cannot.
	if err := s.syncPublic(ctx, created); err != nil {
		return PageDetailResponse{}, err
	}
	return toPageDetail(*created), nil
}

// UpdatePage patches a page (incl. moving it in the tree). Status / publish state
// are NOT touched here (use publish/unpublish). Requires cms.page.edit.
func (s *Service) UpdatePage(ctx context.Context, id *httpx.Identity, pageID uuid.UUID, req UpdatePageRequest) (PageDetailResponse, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return PageDetailResponse{}, err
	}
	cur, err := s.repo.GetPage(ctx, pageID)
	if err != nil {
		return PageDetailResponse{}, mapGetErr(err)
	}
	w := mergePageWrite(cur, req)
	if w.Title == "" {
		return PageDetailResponse{}, apperr.Validation(map[string]string{"title": "required"})
	}
	if req.ParentID.Set {
		if err := s.resolvePageParentMove(ctx, pageID, req.ParentID.Value); err != nil {
			return PageDetailResponse{}, err
		}
		w.ParentID = req.ParentID.Value
	}
	// Re-check the cycle in-tx only for a real move to a non-root parent.
	recheckCycle := req.ParentID.Set && req.ParentID.Value != nil

	updated, err := s.writePageUpdate(ctx, pageID, w, req, recheckCycle)
	if err != nil {
		return PageDetailResponse{}, err
	}
	s.Sec(ctx).Info("cms page updated", "actor", id.UserID, "page", pageID)
	// Save = live: a published page re-freezes its snapshot so title/body/SEO/
	// inline-widget edits reach the public page immediately.
	s.refreshLivePageSnapshot(ctx, updated)
	if err := s.syncPublic(ctx, updated); err != nil {
		return PageDetailResponse{}, err
	}
	return toPageDetail(*updated), nil
}

// writePageUpdate applies the slug plan (business-rules §1, uniqueness scoped to
// the parent) and persists the update.
func (s *Service) writePageUpdate(ctx context.Context, pageID uuid.UUID, w pageWrite, req UpdatePageRequest, recheckCycle bool) (*Page, error) {
	allow := s.AllowSlugEdit(ctx)
	slugBase, change := shared.UpdateSlugPlan(allow, req.RegenerateSlug, req.Slug, w.Title)
	if change && slugBase == "" {
		return nil, apperr.Validation(map[string]string{"slug": "invalid_slug"})
	}
	write := func(slug string) (*Page, error) {
		w.Slug = slug
		return s.repo.UpdatePage(ctx, pageID, w, *req.UpdatedAt, recheckCycle)
	}
	if !change {
		updated, err := write(w.Slug)
		if err != nil {
			return nil, mapWriteErr(err)
		}
		return updated, nil
	}
	updated, err := shared.PersistWithSlug(allow,
		func(slug string) (bool, error) { return s.repo.PageSlugExists(ctx, slug, w.ParentID, &pageID) },
		slugBase, write)
	if err != nil {
		return nil, mapWriteErr(err)
	}
	return updated, nil
}

// DeletePage removes a page that has no children. Requires cms.page.delete.
func (s *Service) DeletePage(ctx context.Context, id *httpx.Identity, pageID uuid.UUID) error {
	if err := s.Require(ctx, id, permDelete); err != nil {
		return err
	}
	cur, err := s.repo.GetPage(ctx, pageID)
	if err != nil {
		return mapGetErr(err)
	}
	hasChildren, err := s.repo.PageHasChildren(ctx, pageID)
	if err != nil {
		return apperr.Internal()
	}
	if hasChildren {
		return apperr.Conflict("page_has_children")
	}
	if err := s.repo.DeletePage(ctx, pageID); err != nil {
		if errors.Is(err, shared.ErrInUse) {
			return apperr.Conflict("page_has_children")
		}
		return apperr.Internal()
	}
	// An orphan in the public read model is not wasted space: it is a URL still
	// serving a page that no longer exists. Same for the translation store.
	if s.pub != nil {
		if err := s.pub.Purge(ctx, EntityPage, pageID); err != nil {
			s.Sec(ctx).Error("purge public doc", "page", pageID, "error", err)
			return apperr.Internal()
		}
	}
	if s.tr != nil {
		if err := s.tr.Purge(ctx, EntityPage, pageID); err != nil {
			s.Sec(ctx).Warn("purge page translations failed", "page", pageID, "err", err)
		}
	}
	// The attached landing lives and dies with its page (there is no standalone
	// landing screen anymore) → delete it too. Best-effort: the page is already
	// gone; a leftover landing is logged, never a user-facing failure.
	if cur.LandingID != nil && s.landing != nil {
		if err := s.landing.Delete(ctx, *cur.LandingID); err != nil {
			s.Sec(ctx).Error("cms page: delete attached landing failed", "page", pageID, "landing", *cur.LandingID, "err", err)
		}
	}
	s.Sec(ctx).Info("cms page deleted", "actor", id.UserID, "page", pageID)
	return nil
}

// PublishPage freezes a snapshot and publishes (draft/scheduled/archived →
// published). No review (admin-only). Requires cms.page.publish.
func (s *Service) PublishPage(ctx context.Context, id *httpx.Identity, pageID uuid.UUID) (PageDetailResponse, error) {
	if err := s.Require(ctx, id, permPublish); err != nil {
		return PageDetailResponse{}, err
	}
	cur, err := s.repo.GetPage(ctx, pageID)
	if err != nil {
		return PageDetailResponse{}, mapGetErr(err)
	}
	if cur.Status == PageStatusPublished {
		return PageDetailResponse{}, apperr.Unprocessable("invalid_status_transition")
	}
	// Freeze the page's inline widgets (type + config, extracted from body_json)
	// into the snapshot; their dynamic data is resolved fresh on the public read.
	snapshot, err := buildPageSnapshot(cur)
	if err != nil {
		return PageDetailResponse{}, apperr.Internal()
	}
	// One publish button: the attached landing's snapshot is frozen as part of
	// publishing the page (the public read only resolves PUBLISHED sections).
	// Landing-first so a published page never shows an empty section list; a
	// landing failure aborts the page publish.
	if cur.LandingID != nil && s.landing != nil {
		if err := s.landing.Publish(ctx, *cur.LandingID); err != nil {
			s.Sec(ctx).Error("cms page: publish attached landing failed", "page", pageID, "landing", *cur.LandingID, "err", err)
			return PageDetailResponse{}, apperr.Internal()
		}
	}
	updated, err := s.repo.PublishPage(ctx, pageID, snapshot)
	if err != nil {
		if errors.Is(err, shared.ErrInvalidStatus) {
			return PageDetailResponse{}, apperr.Unprocessable("invalid_status_transition")
		}
		return PageDetailResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms page published", "actor", id.UserID, "page", pageID, "from", cur.Status, "to", updated.Status)
	if err := s.syncPublic(ctx, updated); err != nil {
		return PageDetailResponse{}, err
	}
	s.Revalidate(ctx, "page:"+updated.Slug)
	return toPageDetail(*updated), nil
}

// UnpublishPage takes a published page off public (published → archived).
// Requires cms.page.publish.
func (s *Service) UnpublishPage(ctx context.Context, id *httpx.Identity, pageID uuid.UUID) (PageDetailResponse, error) {
	if err := s.Require(ctx, id, permPublish); err != nil {
		return PageDetailResponse{}, err
	}
	cur, err := s.repo.GetPage(ctx, pageID)
	if err != nil {
		return PageDetailResponse{}, mapGetErr(err)
	}
	if cur.Status != PageStatusPublished {
		return PageDetailResponse{}, apperr.Unprocessable("invalid_status_transition")
	}
	updated, err := s.repo.UnpublishPage(ctx, pageID)
	if err != nil {
		if errors.Is(err, shared.ErrInvalidStatus) {
			return PageDetailResponse{}, apperr.Unprocessable("invalid_status_transition")
		}
		return PageDetailResponse{}, apperr.Internal()
	}
	// The landing follows the page off public. Best-effort: the page is already
	// unpublished (404 on web), so a landing left published is harmless but logged.
	if cur.LandingID != nil && s.landing != nil {
		if err := s.landing.Unpublish(ctx, *cur.LandingID); err != nil {
			s.Sec(ctx).Error("cms page: unpublish attached landing failed", "page", pageID, "landing", *cur.LandingID, "err", err)
		}
	}
	s.Sec(ctx).Info("cms page unpublished", "actor", id.UserID, "page", pageID)
	if err := s.syncPublic(ctx, updated); err != nil {
		return PageDetailResponse{}, err
	}
	s.Revalidate(ctx, "page:"+updated.Slug)
	return toPageDetail(*updated), nil
}

// --- helpers ---

// buildPageSnapshot freezes a page's public-facing fields (title/body/SEO/og +
// inline-widget type+config) into the JSON served on the public read.
func buildPageSnapshot(p *Page) ([]byte, error) {
	return json.Marshal(pageSnapshot{
		Title: p.Title, Slug: p.Slug, BodyHTML: p.BodyHTML,
		Template: p.Template, OGPath: p.OGPath, LandingID: p.LandingID, SEO: pageSEO(*p),
		InlineWidgets: extractInlineWidgets(p.BodyJSON),
	})
}

// refreshLivePageSnapshot re-freezes a PUBLISHED page's snapshot after an edit so
// the change is live immediately (Save = live), then drops the web's cache for
// its slug. Best-effort + no-op for a non-published page.
func (s *Service) refreshLivePageSnapshot(ctx context.Context, p *Page) {
	if p.Status != PageStatusPublished {
		return
	}
	snap, err := buildPageSnapshot(p)
	if err != nil {
		s.Sec(ctx).Warn("cms page: live snapshot marshal failed", "page", p.ID, "err", err)
		return
	}
	if err := s.repo.RefreshPageSnapshot(ctx, p.ID, snap); err != nil {
		s.Sec(ctx).Warn("cms page: live snapshot refresh failed", "page", p.ID, "err", err)
		return
	}
	// Keep the in-memory row in step: syncPublic publishes from this field, and a
	// stale one would push the pre-edit body out to the public read model.
	p.PublishedSnapshot = snap
	s.Revalidate(ctx, "page:"+p.Slug)
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// mergePageWrite folds a PATCH onto the current row (full-row UPDATE).
func mergePageWrite(cur *Page, req UpdatePageRequest) pageWrite {
	w := pageWrite{
		Title: cur.Title, Slug: cur.Slug, BodyHTML: cur.BodyHTML, BodyJSON: cur.BodyJSON,
		ParentID: cur.ParentID, SortOrder: cur.SortOrder, Template: cur.Template, OGPath: cur.OGPath,
		SEOTitle: cur.SEOTitle, SEODescription: cur.SEODescription, SEOKeywords: cur.SEOKeywords,
		CanonicalURL: cur.CanonicalURL, SEONoindex: cur.SEONoindex, SEONofollow: cur.SEONofollow,
		OGTitle: cur.OGTitle, OGDescription: cur.OGDescription, LandingID: cur.LandingID,
	}
	if req.Title != nil {
		w.Title = strings.TrimSpace(*req.Title)
	}
	if req.BodyHTML != nil {
		w.BodyHTML = sanitizeBody(req.BodyHTML)
	}
	if req.BodyJSON != nil {
		w.BodyJSON = req.BodyJSON
	}
	if req.Template != nil {
		w.Template = req.Template
	}
	if req.OGPath != nil {
		w.OGPath = req.OGPath
	}
	if req.LandingID.Set {
		w.LandingID = req.LandingID.Value // present → set/clear; absent → unchanged
	}
	if req.SortOrder != nil {
		w.SortOrder = *req.SortOrder
	}
	if req.SEO != nil {
		applyPageSEO(&w, req.SEO)
	}
	return w
}

// assertPageExists maps a missing parent to an inline validation error.
func (s *Service) assertPageExists(ctx context.Context, id uuid.UUID) error {
	if _, err := s.repo.GetPage(ctx, id); errors.Is(err, shared.ErrNotFound) {
		return apperr.Validation(map[string]string{"parent_id": "not_found"})
	} else if err != nil {
		return apperr.Internal()
	}
	return nil
}

// resolvePageParentMove validates a move: nil parent (root) always allowed; else
// parent must exist and the move must not create a cycle.
func (s *Service) resolvePageParentMove(ctx context.Context, pageID uuid.UUID, newParent *uuid.UUID) error {
	if newParent == nil {
		return nil
	}
	if *newParent == pageID {
		return apperr.Unprocessable("page_cycle")
	}
	if err := s.assertPageExists(ctx, *newParent); err != nil {
		return err
	}
	cycles, err := s.repo.PageCreatesCycle(ctx, pageID, *newParent)
	if err != nil {
		return apperr.Internal()
	}
	if cycles {
		return apperr.Unprocessable("page_cycle")
	}
	return nil
}

func mapGetErr(err error) error {
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	return apperr.Internal()
}

func mapWriteErr(err error) error {
	switch {
	case errors.Is(err, shared.ErrConflict):
		return apperr.Unprocessable("slug_already_exists")
	case errors.Is(err, shared.ErrParentMissing):
		return apperr.Validation(map[string]string{"parent_id": "not_found"})
	case errors.Is(err, shared.ErrLandingMissing):
		return apperr.Validation(map[string]string{"landing_id": "not_found"})
	case errors.Is(err, shared.ErrPageCycle):
		return apperr.Unprocessable("page_cycle")
	case errors.Is(err, shared.ErrOptLock):
		return apperr.Conflict("conflict")
	case errors.Is(err, shared.ErrNotFound):
		return apperr.NotFound("not_found")
	default:
		return apperr.Internal()
	}
}

// sanitizeBody runs admin-authored page body HTML through the allowlist
// sanitizer that also permits inline-widget placeholders (div[data-kd-widget]).
func sanitizeBody(html *string) *string {
	if html == nil {
		return nil
	}
	clean := htmlsan.BodyWithWidgets(*html)
	return &clean
}

func applyPageSEO(w *pageWrite, seo *shared.PageSEO) {
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

// buildPageTree assembles flat (pre-ordered) rows into a nested tree.
func buildPageTree(rows []Page) []PageResponse {
	type node struct {
		resp     PageResponse
		children []*node
	}
	byID := make(map[uuid.UUID]*node, len(rows))
	for _, p := range rows {
		byID[p.ID] = &node{resp: toPageResponse(p)}
	}
	roots := []*node{}
	for _, p := range rows {
		n := byID[p.ID]
		if p.ParentID != nil {
			if parent, ok := byID[*p.ParentID]; ok {
				parent.children = append(parent.children, n)
				continue
			}
		}
		roots = append(roots, n)
	}
	var materialize func(n *node) PageResponse
	materialize = func(n *node) PageResponse {
		out := n.resp
		out.Children = make([]PageResponse, 0, len(n.children))
		for _, c := range n.children {
			out.Children = append(out.Children, materialize(c))
		}
		return out
	}
	result := make([]PageResponse, 0, len(roots))
	for _, n := range roots {
		result = append(result, materialize(n))
	}
	return result
}
