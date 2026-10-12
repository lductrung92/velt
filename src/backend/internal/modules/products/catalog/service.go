package catalog

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/htmlsan"
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/slug"
	"github.com/velt/backend/internal/platform/storage"
)

// dateLayout is the wire format for released_at — a calendar date, no clock.
const dateLayout = "2006-01-02"

// SettingsPort reads integer settings (the upload cap). Satisfied by the
// settings service; declared here so products stays decoupled.
type SettingsPort interface {
	GetInt(ctx context.Context, key string) int
}

// Service holds the product-catalog business rules.
type Service struct {
	*shared.Base
	repo     Repository
	links    LinksRepository
	store    storage.Storage
	urls     storage.URLer
	settings SettingsPort
	// pub and tr are wired after construction (see public_sync.go) and are both
	// optional: unset means no public read model and no translations.
	pub *pubdocs.Store
	tr  Translator
}

// NewService wires the catalog service onto the shared products base. store and
// urls are the same storage Manager in production; they are separate parameters
// so a test can supply a write-only stub.
func NewService(base *shared.Base, repo Repository, links LinksRepository, store storage.Storage, urls storage.URLer, settings SettingsPort) *Service {
	return &Service{Base: base, repo: repo, links: links, store: store, urls: urls, settings: settings}
}

// --- Reads ---

// List returns a page of products for the console. Requires products.view.
func (s *Service) List(ctx context.Context, id *httpx.Identity, p ListParams) (ListResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return ListResponse{}, err
	}
	p.Page, p.PageSize = normalizePage(p.Page, p.PageSize)
	rows, total, err := s.repo.List(ctx, p)
	if err != nil {
		return ListResponse{}, s.MapRepoErr(ctx, "list products", err)
	}
	items := make([]ListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, s.toListItem(ctx, r))
	}
	return ListResponse{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// Get returns one product. Requires products.view.
func (s *Service) Get(ctx context.Context, id *httpx.Identity, productID uuid.UUID) (Response, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return Response{}, err
	}
	p, err := s.repo.Get(ctx, productID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "get product", err)
	}
	return s.detail(ctx, *p)
}

// --- Writes ---

// Create adds a product. Requires products.create. A new product is always a
// draft; publishing is a separate, separately-permissioned action.
func (s *Service) Create(ctx context.Context, id *httpx.Identity, req CreateRequest) (Response, error) {
	if err := s.Require(ctx, id, permCreate); err != nil {
		return Response{}, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return Response{}, apperr.Validation(map[string]string{"name": "required"})
	}
	lifecycle, err := resolveLifecycle(req.Lifecycle, LifecycleIdea)
	if err != nil {
		return Response{}, err
	}
	released, err := parseDate(req.ReleasedAt)
	if err != nil {
		return Response{}, err
	}
	resolved, err := s.resolveSlug(ctx, req.Slug, name, nil)
	if err != nil {
		return Response{}, err
	}

	w := write{
		Slug:       resolved,
		Name:       name,
		Summary:    trimPtr(req.Summary),
		BodyJSON:   req.BodyJSON,
		Lifecycle:  lifecycle,
		Version:    trimPtr(req.Version),
		ReleasedAt: released,
		Audience:   cleanStrings(req.Audience),
		Platforms:  cleanStrings(req.Platforms),
		TechStack:  cleanStrings(req.TechStack),
		Highlights: cleanStrings(req.Highlights),
		IsFeatured: req.IsFeatured != nil && *req.IsFeatured,
		SortOrder:  req.SortOrder, // nil → repository appends to the end
		DemoAccess: trimPtr(req.DemoAccess),
		// nil → repository appends to the end of the catalog
		DemoInstructions: cleanStrings(req.DemoInstructions),
	}
	if req.BodyHTML != nil {
		w.BodyHTML = sanitizeBody(req.BodyHTML)
	}
	if w.ProductURL, err = optionalHTTPURL(req.ProductURL, "product_url"); err != nil {
		return Response{}, err
	}
	if w.DemoURL, err = optionalHTTPURL(req.DemoURL, "demo_url"); err != nil {
		return Response{}, err
	}
	if err := applySEO(&w.SEO, req.SEO); err != nil {
		return Response{}, err
	}

	// cover_path/og_path are only checkable once the row has an id, so a create
	// never accepts them: the client uploads after the first save. Accepting one
	// here would mean trusting a client-chosen storage key.
	if req.CoverPath != nil && strings.TrimSpace(*req.CoverPath) != "" {
		return Response{}, apperr.Validation(map[string]string{"cover_path": "upload_after_create"})
	}

	var actor *uuid.UUID
	if id != nil {
		actor = &id.UserID
	}
	p, err := s.repo.Create(ctx, w, actor)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "create product", err)
	}
	if err := s.syncPublic(ctx, p); err != nil {
		return Response{}, err
	}
	return s.detail(ctx, *p)
}

// Update applies a PATCH onto the current row. Requires products.edit.
func (s *Service) Update(ctx context.Context, id *httpx.Identity, productID uuid.UUID, req UpdateRequest) (Response, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, productID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "update product: load", err)
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
		if resolved, err = s.resolveSlug(ctx, req.Slug, name, &productID); err != nil {
			return Response{}, err
		}
	}
	lifecycle := cur.Lifecycle
	if req.Lifecycle != nil {
		if lifecycle, err = resolveLifecycle(req.Lifecycle, cur.Lifecycle); err != nil {
			return Response{}, err
		}
	}
	released := cur.ReleasedAt
	if req.ReleasedAt != nil {
		if released, err = parseDate(req.ReleasedAt); err != nil {
			return Response{}, err
		}
	}
	sortOrder := cur.SortOrder
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}

	w := write{
		Slug:             resolved,
		Name:             name,
		Summary:          pickPtr(req.Summary, cur.Summary),
		BodyHTML:         cur.BodyHTML,
		BodyJSON:         cur.BodyJSON,
		CoverPath:        cur.CoverPath,
		Lifecycle:        lifecycle,
		Version:          pickPtr(req.Version, cur.Version),
		ReleasedAt:       released,
		Audience:         cur.Audience,
		Platforms:        cur.Platforms,
		TechStack:        cur.TechStack,
		Highlights:       cur.Highlights,
		IsFeatured:       cur.IsFeatured,
		SortOrder:        &sortOrder,
		ProductURL:       cur.ProductURL,
		DemoURL:          cur.DemoURL,
		DemoAccess:       pickPtr(req.DemoAccess, cur.DemoAccess),
		DemoInstructions: cur.DemoInstructions,
		SEO:              cur.SEO,
	}
	if req.BodyHTML != nil {
		w.BodyHTML = sanitizeBody(req.BodyHTML)
	}
	if req.BodyJSON != nil {
		w.BodyJSON = req.BodyJSON
	}
	if req.Audience != nil {
		w.Audience = cleanStrings(*req.Audience)
	}
	if req.Platforms != nil {
		w.Platforms = cleanStrings(*req.Platforms)
	}
	if req.TechStack != nil {
		w.TechStack = cleanStrings(*req.TechStack)
	}
	if req.Highlights != nil {
		w.Highlights = cleanStrings(*req.Highlights)
	}
	if req.DemoInstructions != nil {
		w.DemoInstructions = cleanStrings(*req.DemoInstructions)
	}
	if req.IsFeatured != nil {
		w.IsFeatured = *req.IsFeatured
	}
	if req.ProductURL != nil {
		if w.ProductURL, err = optionalHTTPURL(req.ProductURL, "product_url"); err != nil {
			return Response{}, err
		}
	}
	if req.DemoURL != nil {
		if w.DemoURL, err = optionalHTTPURL(req.DemoURL, "demo_url"); err != nil {
			return Response{}, err
		}
	}
	if req.SEO != nil {
		w.SEO = SEO{}
		if err := applySEO(&w.SEO, req.SEO); err != nil {
			return Response{}, err
		}
		if !shared.OwnsMedia(mediaPrefix(productID), deref(w.SEO.OGPath)) {
			return Response{}, apperr.Validation(map[string]string{"seo.og_path": "forbidden"})
		}
	}
	if req.CoverPath != nil {
		p := strings.TrimSpace(*req.CoverPath)
		if !shared.OwnsMedia(mediaPrefix(productID), p) {
			return Response{}, apperr.Validation(map[string]string{"cover_path": "forbidden"})
		}
		w.CoverPath = emptyToNil(p)
	}

	updated, err := s.repo.Update(ctx, productID, w)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "update product", err)
	}
	// Only reclaim a replaced image when no published snapshot still points at
	// it; the frozen copy must keep rendering.
	if cur.PublishedSnapshot == nil {
		prefix := mediaPrefix(productID)
		shared.DeleteOldMedia(ctx, s.store, prefix, cur.CoverPath, updated.CoverPath)
		shared.DeleteOldMedia(ctx, s.store, prefix, cur.SEO.OGPath, updated.SEO.OGPath)
	}
	// A published product keeps the body it was published with, but its address
	// is the live slug: re-syncing here is what lets a rename take effect without
	// forcing a republish, and leaves a 301 behind on the old URL.
	if err := s.syncPublic(ctx, updated); err != nil {
		return Response{}, err
	}
	return s.detail(ctx, *updated)
}

// Delete removes a product and purges its whole media folder. Requires
// products.delete. Use Archive to take a product off the site but keep it.
func (s *Service) Delete(ctx context.Context, id *httpx.Identity, productID uuid.UUID) error {
	if err := s.Require(ctx, id, permDelete); err != nil {
		return err
	}
	if err := s.repo.Delete(ctx, productID); err != nil {
		return s.MapRepoErr(ctx, "delete product", err)
	}
	// An orphan in the public read model is not wasted space: it is a URL still
	// serving a product that no longer exists. Same for the translation store.
	if s.pub != nil {
		if err := s.pub.Purge(ctx, EntityProduct, productID); err != nil {
			s.Sec(ctx).Error("products: purge public doc", "product_id", productID, "err", err)
			return apperr.Internal()
		}
	}
	if s.tr != nil {
		if err := s.tr.Purge(ctx, EntityProduct, productID); err != nil {
			s.Sec(ctx).Warn("products: purge translations failed", "product_id", productID, "err", err)
		}
	}
	if err := shared.PurgeMediaTree(ctx, s.store, mediaPrefix(productID)); err != nil {
		s.Sec(ctx).Warn("products: purge media failed", "product_id", productID, "err", err)
	}
	return nil
}

// --- Publication ---

// Publish makes the product public and freezes the snapshot the site reads.
// Requires products.publish.
func (s *Service) Publish(ctx context.Context, id *httpx.Identity, productID uuid.UUID) (Response, error) {
	return s.transition(ctx, id, productID, StatusPublished)
}

// Unpublish returns the product to draft. The snapshot and published_at are
// kept: re-publishing later is a restore, not a new release.
func (s *Service) Unpublish(ctx context.Context, id *httpx.Identity, productID uuid.UUID) (Response, error) {
	return s.transition(ctx, id, productID, StatusDraft)
}

// Archive takes the product off the site but keeps the row and its URL.
func (s *Service) Archive(ctx context.Context, id *httpx.Identity, productID uuid.UUID) (Response, error) {
	return s.transition(ctx, id, productID, StatusArchived)
}

func (s *Service) transition(ctx context.Context, id *httpx.Identity, productID uuid.UUID, status string) (Response, error) {
	if err := s.Require(ctx, id, permPublish); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, productID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "transition product: load", err)
	}
	if cur.Status == status {
		return Response{}, apperr.Conflict("already_in_state")
	}

	var snapshot json.RawMessage
	stamp := false
	if status == StatusPublished {
		full, derr := s.detail(ctx, *cur)
		if derr != nil {
			return Response{}, derr
		}
		if snapshot, err = json.Marshal(full); err != nil {
			s.Sec(ctx).Error("products: snapshot encode", "err", err)
			return Response{}, apperr.Internal()
		}
		stamp = cur.PublishedAt == nil
	}

	p, err := s.repo.SetStatus(ctx, productID, status, snapshot, stamp)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "transition product", err)
	}
	if err := s.syncPublic(ctx, p); err != nil {
		return Response{}, err
	}
	// Both slugs: publishing under a new slug has to clear the old URL too, or
	// the site keeps serving a page that no longer exists.
	tags := []string{"products:list", "product:" + p.Slug}
	if cur.Slug != p.Slug {
		tags = append(tags, "product:"+cur.Slug)
	}
	s.Revalidate(ctx, tags...)
	return s.detail(ctx, *p)
}

// --- Helpers ---

// mediaPrefix is the storage folder that owns a product's uploaded media.
func mediaPrefix(id uuid.UUID) string { return "products/" + id.String() + "/" }

// resolveSlug normalises the requested slug (or derives one from the name) and
// makes it unique by suffixing -01, -02, … A product slug is its public URL, so
// a collision gets a suffix rather than an error the author must resolve.
func (s *Service) resolveSlug(ctx context.Context, provided *string, name string, excludeID *uuid.UUID) (string, error) {
	base := ""
	if provided != nil {
		base = slug.Make(*provided)
	}
	if base == "" {
		base = slug.Make(name)
	}
	if base == "" {
		return "", apperr.Validation(map[string]string{"slug": "invalid"})
	}
	out, err := slug.Unique(func(cand string) (bool, error) {
		return s.repo.SlugExists(ctx, cand, excludeID)
	}, base)
	if err != nil {
		s.Sec(ctx).Error("products: resolve slug", "err", err)
		return "", apperr.Internal()
	}
	return out, nil
}

// detail decorates a product row with its categories, members and gallery.
// Every single-product reply goes through it so the console always sees one
// shape, and so the published snapshot freezes the relations too.
func (s *Service) detail(ctx context.Context, p Product) (Response, error) {
	res := s.toResponse(ctx, p)
	cats, err := s.categoriesOf(ctx, p.ID)
	if err != nil {
		return Response{}, err
	}
	members, err := s.membersOf(ctx, p.ID)
	if err != nil {
		return Response{}, err
	}
	gallery, err := s.galleryOf(ctx, p.ID)
	if err != nil {
		return Response{}, err
	}
	res.Categories, res.Members, res.Gallery = cats, members, gallery
	return res, nil
}

func (s *Service) toResponse(ctx context.Context, p Product) Response {
	return Response{
		ID: p.ID, Slug: p.Slug, Name: p.Name, Summary: p.Summary,
		BodyHTML: p.BodyHTML, BodyJSON: p.BodyJSON,
		CoverURL: s.mediaURL(ctx, p.CoverPath), CoverPath: p.CoverPath,
		Status: p.Status, Lifecycle: p.Lifecycle,
		Version: p.Version, ReleasedAt: formatDate(p.ReleasedAt),
		Audience: p.Audience, Platforms: p.Platforms,
		TechStack: p.TechStack, Highlights: p.Highlights,
		IsFeatured: p.IsFeatured, SortOrder: p.SortOrder,
		ProductURL: p.ProductURL, DemoURL: p.DemoURL, DemoAccess: p.DemoAccess,
		DemoInstructions: p.DemoInstructions,
		SEO:              p.SEO,
		PublishedAt:      p.PublishedAt, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

func (s *Service) toListItem(ctx context.Context, p Product) ListItem {
	return ListItem{
		ID: p.ID, Slug: p.Slug, Name: p.Name, Summary: p.Summary,
		CoverURL: s.mediaURL(ctx, p.CoverPath),
		Status:   p.Status, Lifecycle: p.Lifecycle, Version: p.Version,
		ReleasedAt: formatDate(p.ReleasedAt), IsFeatured: p.IsFeatured,
		SortOrder: p.SortOrder, UpdatedAt: p.UpdatedAt, PublishedA: p.PublishedAt,
	}
}

func (s *Service) mediaURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" || s.urls == nil {
		return nil
	}
	u := s.urls.URL(ctx, *path)
	return &u
}

// sanitizeBody runs the rich-text body through the HTML allowlist. It is stored
// and later rendered as raw HTML on the public site, so this is the only thing
// standing between an author (or a compromised one) and stored XSS.
func sanitizeBody(v *string) *string {
	if v == nil {
		return nil
	}
	clean := htmlsan.Body(*v)
	if strings.TrimSpace(clean) == "" {
		return nil
	}
	return &clean
}

func resolveLifecycle(v *string, fallback string) (string, error) {
	if v == nil {
		return fallback, nil
	}
	l := strings.TrimSpace(*v)
	if l == "" {
		return fallback, nil
	}
	if !validLifecycle[l] {
		return "", apperr.Validation(map[string]string{"lifecycle": "invalid"})
	}
	return l, nil
}

// parseDate accepts "YYYY-MM-DD", and treats an empty string as "clear it".
func parseDate(v *string) (*time.Time, error) {
	if v == nil {
		return nil, nil
	}
	raw := strings.TrimSpace(*v)
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(dateLayout, raw)
	if err != nil {
		return nil, apperr.Validation(map[string]string{"released_at": "invalid"})
	}
	return &t, nil
}

func formatDate(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(dateLayout)
	return &s
}

// applySEO copies a present SEO block onto the write, trimming each field. A nil
// block is a no-op; a present one replaces every field, so clearing one is just
// sending it empty.
func applySEO(dst *SEO, src *SEO) error {
	if src == nil {
		return nil
	}
	canonical, err := optionalHTTPURL(src.Canonical, "seo.canonical_url")
	if err != nil {
		return err
	}
	*dst = SEO{
		Title:       trimPtr(src.Title),
		Description: trimPtr(src.Description),
		Keywords:    trimPtr(src.Keywords),
		Canonical:   canonical,
		NoIndex:     src.NoIndex,
		NoFollow:    src.NoFollow,
		OGTitle:     trimPtr(src.OGTitle),
		OGDesc:      trimPtr(src.OGDesc),
		OGPath:      trimPtr(src.OGPath),
	}
	return nil
}

// optionalHTTPURL trims an optional URL field and rejects any scheme other than
// http(s). These values are rendered as links / <link rel=canonical> on the
// public site, so javascript: and data: must never reach the template.
func optionalHTTPURL(v *string, field string) (*string, error) {
	t := trimPtr(v)
	if t == nil {
		return nil, nil
	}
	u, err := url.Parse(*t)
	if err != nil {
		return nil, apperr.Validation(map[string]string{field: "invalid"})
	}
	scheme := strings.ToLower(u.Scheme)
	if (scheme != "http" && scheme != "https") || u.Host == "" {
		return nil, apperr.Validation(map[string]string{field: "invalid_scheme"})
	}
	return t, nil
}

func normalizePage(page, size int) (int, int) {
	if page < 1 {
		page = 1
	}
	if size <= 0 {
		size = defaultPageSize
	}
	if size > maxPageSize {
		size = maxPageSize
	}
	return page, size
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

// pickPtr resolves a PATCH field: absent keeps the current value, present
// replaces it (an explicit empty string clears it, via trimPtr).
func pickPtr(req, cur *string) *string {
	if req == nil {
		return cur
	}
	return trimPtr(req)
}

func emptyToNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func cleanStrings(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, v := range in {
		t := strings.TrimSpace(v)
		if t == "" {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}
