package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/media"
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/storage"
)

const (
	publicDefaultPageSize = 20
	publicMaxPageSize     = 60
)

// publicReader is the read seam the public catalog needs (PublicRepository
// satisfies it; a fake stands in for tests).
type publicReader interface {
	ListPublished(ctx context.Context, p PublicListParams) ([]json.RawMessage, int, error)
	GetPublishedBySlug(ctx context.Context, locale, slug string) (*PublishedProduct, error)
	ListPublicCategories(ctx context.Context) ([]PublicCategory, error)
	IDsBySlugs(ctx context.Context, slugs []string) ([]uuid.UUID, error)
}

// localeLister is the one thing the public catalog needs from the translation
// module: which languages exist. nil means Vietnamese only, which is also what
// the feature switched off looks like.
type localeLister interface {
	Locales(ctx context.Context) []string
}

// PublicService serves the published catalog to the site. It has no permission
// gate — there is no caller identity — so its only safety rule is that it can
// only ever read published documents.
type PublicService struct {
	*shared.Base
	repo publicReader
	// The snapshot freezes seo.og_path (a storage key), not a URL — the admin
	// response never built one — so the public layer resolves it here.
	urls    storage.URLer
	locales localeLister
	// assets upgrades a stored image URL to its flat /img address and attaches
	// the size recorded for it; nil until wired, and nil answers nothing.
	assets *media.PublicURLs
}

// NewPublicService builds the public catalog service.
func NewPublicService(base *shared.Base, repo publicReader, urls storage.URLer) *PublicService {
	return &PublicService{Base: base, repo: repo, urls: urls}
}

// SetLocales wires the translation module's language list (called once at
// startup). Unset → Vietnamese only.
func (s *PublicService) SetLocales(l localeLister) { s.locales = l }

// SetMediaURLs wires the read-path media mapping (called once at startup).
// Unset → the legacy /api/files URLs and no dimensions, which is what this
// response looked like before the `files` table existed.
func (s *PublicService) SetMediaURLs(m *media.PublicURLs) { s.assets = m }

// resolveLocale maps the ?locale= parameter onto a language that is actually
// published. Anything unknown serves the original rather than an error: a
// visitor who mistypes a query parameter has not earned an error page.
func (s *PublicService) resolveLocale(ctx context.Context, raw string) string {
	want := strings.ToLower(strings.TrimSpace(raw))
	if want == "" || want == baseLocale || s.locales == nil {
		return baseLocale
	}
	for _, l := range s.locales.Locales(ctx) {
		if l == want {
			return want
		}
	}
	return baseLocale
}

func (s *PublicService) mediaURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" || s.urls == nil {
		return nil
	}
	u := s.urls.URL(ctx, *path)
	return &u
}

// normalize clamps paging and rejects unknown sort keys rather than passing
// them to SQL.
func (p PublicListParams) normalize() PublicListParams {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = publicDefaultPageSize
	}
	if p.PageSize > publicMaxPageSize {
		p.PageSize = publicMaxPageSize
	}
	switch p.Sort {
	case "name", "newest", "featured", "random":
	default:
		p.Sort = "featured"
	}
	p.Query = strings.TrimSpace(p.Query)
	return p
}

// List returns one page of the published catalog.
func (s *PublicService) List(ctx context.Context, p PublicListParams) (PublicListResponse, error) {
	p = p.normalize()
	p.Locale = s.resolveLocale(ctx, p.Locale)
	snaps, total, err := s.repo.ListPublished(ctx, p)
	if err != nil {
		return PublicListResponse{}, s.MapRepoErr(ctx, "public list products", err)
	}

	items := make([]PublicListItem, 0, len(snaps))
	for _, raw := range snaps {
		full, err := decodeSnapshot(raw)
		if err != nil {
			// One corrupt snapshot must not take the whole catalog down; skip
			// it and leave a trail. Total stays as counted, which is honest:
			// the row does exist, we just cannot render it.
			s.Sec(ctx).Error("products: public list snapshot decode", "err", err)
			continue
		}
		items = append(items, toPublicListItem(full))
	}
	// One lookup for the whole page: 20 products cost one query, not 20.
	covers := make([]string, 0, len(items))
	for i := range items {
		media.Collect(&covers, items[i].CoverURL)
	}
	found := s.assets.Resolve(ctx, covers)
	for i := range items {
		items[i].CoverWidth, items[i].CoverHeight = media.Apply(found, &items[i].CoverURL)
	}
	return PublicListResponse{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// GetBySlug returns one published product page in the requested language.
//
// A draft and a product that does not exist both answer 404: telling them apart
// would confirm that an unpublished slug is taken. A retired slug, or another
// language's slug for the same product, comes back as ErrMoved for the handler
// to answer with a 301.
func (s *PublicService) GetBySlug(ctx context.Context, locale, slug string) (PublicDetail, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return PublicDetail{}, apperr.NotFound("not_found")
	}
	want := s.resolveLocale(ctx, locale)
	doc, err := s.repo.GetPublishedBySlug(ctx, want, slug)
	var moved ErrMoved
	if errors.As(err, &moved) {
		return PublicDetail{}, moved
	}
	if err != nil {
		return PublicDetail{}, s.MapRepoErr(ctx, "public get product", err)
	}
	full, err := decodeSnapshot(doc.Body)
	if err != nil {
		s.Sec(ctx).Error("products: public detail snapshot decode", "slug", slug, "err", err)
		return PublicDetail{}, apperr.Internal()
	}
	return s.toPublicDetail(ctx, full, want, doc.Alternates), nil
}

// Categories returns the filter vocabulary: categories that currently hold at
// least one published product.
func (s *PublicService) Categories(ctx context.Context) (map[string]any, error) {
	rows, err := s.repo.ListPublicCategories(ctx)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "public list categories", err)
	}
	items := make([]map[string]any, 0, len(rows))
	for _, c := range rows {
		items = append(items, map[string]any{
			"slug": c.Slug, "name": c.Name, "product_count": c.ProductCount,
		})
	}
	return map[string]any{"items": items}, nil
}

// decodeSnapshot reads a frozen admin Response back out of the snapshot column.
func decodeSnapshot(raw json.RawMessage) (Response, error) {
	var full Response
	if err := json.Unmarshal(raw, &full); err != nil {
		return Response{}, err
	}
	return full, nil
}

func toPublicCategories(in []CategoryRef) []PublicCategoryRef {
	out := make([]PublicCategoryRef, 0, len(in))
	for _, c := range in {
		out = append(out, PublicCategoryRef{Slug: c.Slug, Name: c.Name})
	}
	return out
}

func toPublicListItem(f Response) PublicListItem {
	return PublicListItem{
		Slug:       f.Slug,
		Name:       f.Name,
		Summary:    f.Summary,
		CoverURL:   f.CoverURL,
		Lifecycle:  f.Lifecycle,
		IsFeatured: f.IsFeatured,
		Audience:   emptyIfNil(f.Audience),
		Platforms:  emptyIfNil(f.Platforms),
		Categories: toPublicCategories(f.Categories),
	}
}

func (s *PublicService) toPublicDetail(ctx context.Context, f Response, locale string, alternates []pubdocs.Ref) PublicDetail {
	alts := make([]PublicAlternate, 0, len(alternates))
	for _, a := range alternates {
		alts = append(alts, PublicAlternate{Locale: a.Locale, Slug: a.Slug, XDefault: a.Locale == baseLocale})
	}
	members := make([]PublicMemberRef, 0, len(f.Members))
	for _, m := range f.Members {
		members = append(members, PublicMemberRef{
			Slug: m.Slug, FullName: m.FullName, Role: m.Role, AvatarURL: m.AvatarURL,
		})
	}
	gallery := make([]PublicMediaItem, 0, len(f.Gallery))
	for _, g := range f.Gallery {
		gallery = append(gallery, PublicMediaItem{
			Kind: g.Kind, URL: g.URL, VideoURL: g.VideoURL, Caption: g.Caption,
		})
	}
	out := PublicDetail{
		Slug:       f.Slug,
		Locale:     locale,
		Name:       f.Name,
		Summary:    f.Summary,
		BodyHTML:   f.BodyHTML,
		CoverURL:   f.CoverURL,
		Lifecycle:  f.Lifecycle,
		Version:    f.Version,
		ReleasedAt: f.ReleasedAt,
		Audience:   emptyIfNil(f.Audience),
		Platforms:  emptyIfNil(f.Platforms),
		TechStack:  emptyIfNil(f.TechStack),
		Highlights: emptyIfNil(f.Highlights),
		IsFeatured: f.IsFeatured,
		ProductURL: f.ProductURL,
		Demo: PublicDemo{
			URL:          f.DemoURL,
			Access:       f.DemoAccess,
			Instructions: emptyIfNil(f.DemoInstructions),
		},
		SEO: PublicSEO{
			Title:         f.SEO.Title,
			Description:   f.SEO.Description,
			Keywords:      f.SEO.Keywords,
			CanonicalURL:  f.SEO.Canonical,
			Noindex:       f.SEO.NoIndex,
			Nofollow:      f.SEO.NoFollow,
			OGTitle:       f.SEO.OGTitle,
			OGDescription: f.SEO.OGDesc,
			OGImageURL:    s.mediaURL(ctx, f.SEO.OGPath),
		},
		Categories:  toPublicCategories(f.Categories),
		Members:     members,
		Gallery:     gallery,
		PublishedAt: f.PublishedAt,
		Alternates:  alts,
	}
	s.upgradeDetailMedia(ctx, &out)
	return out
}

// upgradeDetailMedia rewrites every image URL on a product page to its flat
// /img address and attaches the intrinsic size — cover, OG image, each gallery
// image and each credited member's avatar — in ONE lookup for the whole page.
//
// The gallery items and member avatars are read back from the frozen snapshot,
// which kept only the built URL and threw the storage key away; that is why the
// batch is collected from the URLs rather than from paths.
func (s *PublicService) upgradeDetailMedia(ctx context.Context, out *PublicDetail) {
	values := make([]string, 0, 3+len(out.Gallery)+len(out.Members))
	media.Collect(&values, out.CoverURL)
	media.Collect(&values, out.SEO.OGImageURL)
	for i := range out.Gallery {
		media.Collect(&values, out.Gallery[i].URL)
	}
	for i := range out.Members {
		media.Collect(&values, out.Members[i].AvatarURL)
	}
	found := s.assets.Resolve(ctx, values)
	out.CoverWidth, out.CoverHeight = media.Apply(found, &out.CoverURL)
	out.SEO.OGImageWidth, out.SEO.OGImageHeight = media.Apply(found, &out.SEO.OGImageURL)
	for i := range out.Gallery {
		out.Gallery[i].Width, out.Gallery[i].Height = media.Apply(found, &out.Gallery[i].URL)
	}
	for i := range out.Members {
		out.Members[i].AvatarWidth, out.Members[i].AvatarHeight =
			media.Apply(found, &out.Members[i].AvatarURL)
	}
}

// emptyIfNil turns a nil slice into an empty one so the JSON is [] rather than
// null — the site never has to special-case a missing list.
func emptyIfNil(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

// ResolvePublishedSlugs turns product slugs into ids, skipping anything that is
// not published. Unknown slugs are dropped rather than refused: the caller is
// an assistant repeating what a visitor said, not a client that can be fixed.
func (s *PublicService) ResolvePublishedSlugs(ctx context.Context, slugs []string) ([]uuid.UUID, error) {
	ids, err := s.repo.IDsBySlugs(ctx, slugs)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "resolve slugs", err)
	}
	return ids, nil
}
