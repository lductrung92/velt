package landing

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/storage"
)

// Service holds landing-builder business logic.
type Service struct {
	*shared.Base
	repo  Repository
	files storage.Storage // builds served URLs for og_path media
}

// NewService wires the landing service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository, files storage.Storage) *Service {
	return &Service{Base: base, repo: repo, files: files}
}

// ListLandings returns all landing pages (no sections). Requires cms.landing.manage.
func (s *Service) ListLandings(ctx context.Context, id *httpx.Identity) ([]Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return nil, err
	}
	pages, err := s.repo.ListLandings(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	out := make([]Response, 0, len(pages))
	for _, p := range pages {
		out = append(out, s.landingResponse(ctx, p))
	}
	return out, nil
}

// GetLanding returns a landing page + its sections (builder data).
func (s *Service) GetLanding(ctx context.Context, id *httpx.Identity, landingID uuid.UUID) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	p, err := s.repo.GetLanding(ctx, landingID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	return s.landingDetail(ctx, *p)
}

// CreateLanding creates a landing page. Requires cms.landing.manage. key UNIQUE.
func (s *Service) CreateLanding(ctx context.Context, id *httpx.Identity, req CreateLandingRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	key, name := strings.TrimSpace(req.Key), strings.TrimSpace(req.Name)
	if key == "" {
		return Response{}, apperr.Validation(map[string]string{"key": "required"})
	}
	if name == "" {
		return Response{}, apperr.Validation(map[string]string{"name": "required"})
	}
	// No landing id exists yet, so no media could have been uploaded to it — a
	// non-empty og_path can only reference another entity's file. Attach og media
	// after create via upload + PATCH.
	if req.OGPath != nil && *req.OGPath != "" {
		return Response{}, apperr.Validation(map[string]string{"og_path": "invalid_value"})
	}
	w := landingWrite{Key: key, Name: name, OGPath: req.OGPath}
	applyLandingSEO(&w, req.SEO)
	p, err := s.repo.CreateLanding(ctx, w)
	if err != nil {
		return Response{}, mapWriteErr(err)
	}
	s.Sec(ctx).Info("cms landing created", "actor", id.UserID, "landing", p.ID, "key", p.Key)
	return s.landingResponse(ctx, *p), nil
}

// UpdateLanding patches key/name/og/seo (seo is whole-object replace).
func (s *Service) UpdateLanding(ctx context.Context, id *httpx.Identity, landingID uuid.UUID, req UpdateLandingRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.GetLanding(ctx, landingID)
	if err != nil {
		return Response{}, mapGetErr(err)
	}
	w := landingWrite{
		Key: cur.Key, Name: cur.Name, OGPath: cur.OGPath,
		SEOTitle: cur.SEOTitle, SEODescription: cur.SEODescription, SEOKeywords: cur.SEOKeywords,
		CanonicalURL: cur.CanonicalURL, SEONoindex: cur.SEONoindex, SEONofollow: cur.SEONofollow,
		OGTitle: cur.OGTitle, OGDescription: cur.OGDescription,
	}
	if req.Key != nil {
		w.Key = strings.TrimSpace(*req.Key)
	}
	if req.Name != nil {
		w.Name = strings.TrimSpace(*req.Name)
	}
	if req.OGPath != nil {
		if !shared.OwnsMedia(landingMediaPrefix(landingID), *req.OGPath) {
			return Response{}, apperr.Validation(map[string]string{"og_path": "invalid_value"})
		}
		w.OGPath = req.OGPath
	}
	if req.SEO != nil {
		applyLandingSEO(&w, req.SEO)
	}
	if w.Key == "" {
		return Response{}, apperr.Validation(map[string]string{"key": "required"})
	}
	if w.Name == "" {
		return Response{}, apperr.Validation(map[string]string{"name": "required"})
	}
	p, err := s.repo.UpdateLanding(ctx, landingID, w, *req.UpdatedAt)
	if err != nil {
		return Response{}, mapWriteErr(err)
	}
	s.Sec(ctx).Info("cms landing updated", "actor", id.UserID, "landing", landingID)
	return s.landingResponse(ctx, *p), nil
}

// DeleteLanding removes a landing page (sections cascade).
func (s *Service) DeleteLanding(ctx context.Context, id *httpx.Identity, landingID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	if _, err := s.repo.GetLanding(ctx, landingID); err != nil {
		return mapGetErr(err)
	}
	if err := s.repo.DeleteLanding(ctx, landingID); err != nil {
		return apperr.Internal()
	}
	// Landing (+ snapshot) gone → reclaim its whole media folder. Best-effort.
	if err := shared.PurgeMediaTree(ctx, s.files, "cms/landing/"+landingID.String()+"/"); err != nil {
		s.Sec(ctx).Warn("cms landing media purge failed", "landing", landingID, "err", err)
	}
	s.Sec(ctx).Info("cms landing deleted", "actor", id.UserID, "landing", landingID)
	return nil
}

// CreateSection appends a section (config validated/sanitized per type).
func (s *Service) CreateSection(ctx context.Context, id *httpx.Identity, landingID uuid.UUID, req CreateSectionRequest) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	p, err := s.repo.GetLanding(ctx, landingID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	cfg, err := sanitizeSectionConfig(req.Type, req.Config, landingMediaPrefix(landingID))
	if err != nil {
		return DetailResponse{}, err
	}
	visible := true
	if req.IsVisible != nil {
		visible = *req.IsVisible
	}
	if _, err := s.repo.CreateSection(ctx, landingID, req.Type, cfg, visible); err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	s.Sec(ctx).Info("cms landing section created", "actor", id.UserID, "landing", landingID, "type", req.Type)
	s.refreshLiveSnapshot(ctx, landingID)
	return s.landingDetail(ctx, *p)
}

// UpdateSection patches a section's config/visibility (config re-sanitized).
func (s *Service) UpdateSection(ctx context.Context, id *httpx.Identity, sectionID uuid.UUID, req UpdateSectionRequest) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	cur, err := s.repo.GetSection(ctx, sectionID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	cfg := cur.Config
	if len(req.Config) > 0 {
		cfg, err = sanitizeSectionConfig(cur.Type, req.Config, landingMediaPrefix(cur.LandingPageID))
		if err != nil {
			return DetailResponse{}, err
		}
	}
	visible := cur.IsVisible
	if req.IsVisible != nil {
		visible = *req.IsVisible
	}
	if _, err := s.repo.UpdateSection(ctx, sectionID, cfg, visible); err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	p, err := s.repo.GetLanding(ctx, cur.LandingPageID)
	if err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms landing section updated", "actor", id.UserID, "section", sectionID)
	s.refreshLiveSnapshot(ctx, cur.LandingPageID)
	return s.landingDetail(ctx, *p)
}

// DeleteSection removes a section.
func (s *Service) DeleteSection(ctx context.Context, id *httpx.Identity, sectionID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	cur, err := s.repo.GetSection(ctx, sectionID)
	if err != nil {
		return mapGetErr(err)
	}
	if err := s.repo.DeleteSection(ctx, sectionID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("cms landing section deleted", "actor", id.UserID, "section", sectionID)
	s.refreshLiveSnapshot(ctx, cur.LandingPageID)
	return nil
}

// ReorderSections sets the section order. The provided ids must be exactly the
// landing's current sections (count + membership) → else 422.
func (s *Service) ReorderSections(ctx context.Context, id *httpx.Identity, landingID uuid.UUID, req ReorderSectionsRequest) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	p, err := s.repo.GetLanding(ctx, landingID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	sections, err := s.repo.LandingSections(ctx, landingID)
	if err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	if !sameSectionSet(sections, req.SectionIDs) {
		return DetailResponse{}, apperr.Validation(map[string]string{"section_ids": "mismatch"})
	}
	if err := s.repo.ReorderSections(ctx, landingID, req.SectionIDs); err != nil {
		if errors.Is(err, shared.ErrNotFound) { // set changed concurrently (TOCTOU backstop in tx)
			return DetailResponse{}, apperr.Validation(map[string]string{"section_ids": "mismatch"})
		}
		return DetailResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms landing sections reordered", "actor", id.UserID, "landing", landingID)
	s.refreshLiveSnapshot(ctx, landingID)
	return s.landingDetail(ctx, *p)
}

// PublishLanding freezes the visible sections + SEO into published_snapshot.
func (s *Service) PublishLanding(ctx context.Context, id *httpx.Identity, landingID uuid.UUID) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	cur, err := s.repo.GetLanding(ctx, landingID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	sections, err := s.repo.LandingSections(ctx, landingID)
	if err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	snap, err := buildLandingSnapshot(*cur, sections)
	if err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	p, err := s.repo.PublishLanding(ctx, landingID, snap)
	if err != nil {
		if errors.Is(err, shared.ErrInvalidStatus) {
			return DetailResponse{}, apperr.Unprocessable("invalid_status_transition")
		}
		return DetailResponse{}, apperr.Internal()
	}
	// Reclaim media dropped from the snapshot since the last publish (safe now
	// that public reads the new snapshot) — but keep anything still referenced by
	// a current (incl. hidden/draft) section or the og_path.
	gcDroppedMedia(ctx, s.files, landingMediaPrefix(landingID), cur.PublishedSnapshot,
		liveMediaPaths(snap, sections, cur.OGPath))
	s.Sec(ctx).Info("cms landing published", "actor", id.UserID, "landing", landingID, "key", p.Key)
	s.revalidateHostPages(ctx, landingID)
	return s.landingDetail(ctx, *p)
}

// UnpublishLanding takes a landing page off public (status → draft).
func (s *Service) UnpublishLanding(ctx context.Context, id *httpx.Identity, landingID uuid.UUID) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	if _, err := s.repo.GetLanding(ctx, landingID); err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	p, err := s.repo.UnpublishLanding(ctx, landingID)
	if err != nil {
		if errors.Is(err, shared.ErrInvalidStatus) {
			return DetailResponse{}, apperr.Unprocessable("invalid_status_transition")
		}
		return DetailResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms landing unpublished", "actor", id.UserID, "landing", landingID)
	s.revalidateHostPages(ctx, landingID)
	return s.landingDetail(ctx, *p)
}

// revalidateHostPages drops the web ISR cache of every published page that
// attaches this landing (its sections just changed). Best-effort.
func (s *Service) revalidateHostPages(ctx context.Context, landingID uuid.UUID) {
	slugs, err := s.repo.PublishedPageSlugsUsingLanding(ctx, landingID)
	if err != nil {
		s.Sec(ctx).Warn("cms landing: host-page revalidate lookup failed", "landing", landingID, "err", err)
		return
	}
	tags := make([]string, 0, len(slugs))
	for _, slug := range slugs {
		tags = append(tags, "page:"+slug)
	}
	if len(tags) > 0 {
		s.Revalidate(ctx, tags...)
	}
}

// refreshLiveSnapshot re-freezes a PUBLISHED landing's snapshot from its CURRENT
// sections after an edit (add / hide / delete / reorder / config) so the change
// reaches the public page immediately (Save = live), then revalidates the host
// pages. Best-effort + no-op for a draft landing (nothing public yet).
func (s *Service) refreshLiveSnapshot(ctx context.Context, landingID uuid.UUID) {
	cur, err := s.repo.GetLanding(ctx, landingID)
	if err != nil || cur.Status != LandingStatusPublished {
		return
	}
	sections, err := s.repo.LandingSections(ctx, landingID)
	if err != nil {
		s.Sec(ctx).Warn("cms landing: live-refresh sections load failed", "landing", landingID, "err", err)
		return
	}
	snap, err := buildLandingSnapshot(*cur, sections)
	if err != nil {
		return
	}
	if _, err := s.repo.SetLandingPublished(ctx, landingID, snap); err != nil {
		s.Sec(ctx).Warn("cms landing: live-refresh snapshot failed", "landing", landingID, "err", err)
		return
	}
	s.revalidateHostPages(ctx, landingID)
}

func (s *Service) landingResponse(ctx context.Context, p Page) Response {
	return Response{
		ID: p.ID, Key: p.Key, Name: p.Name, Status: p.Status,
		OGURL: s.mediaURL(ctx, p.OGPath), SEO: landingSEOObj(p),
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

func (s *Service) landingDetail(ctx context.Context, p Page) (DetailResponse, error) {
	sections, err := s.repo.LandingSections(ctx, p.ID)
	if err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	items := make([]SectionResponse, 0, len(sections))
	for _, sec := range sections {
		r := toSectionResponse(sec)
		// Inject *_url next to stored *_path keys so the builder can preview
		// already-saved images (mirrors the public read path).
		r.Config = resolveConfigMediaURLs(ctx, s.files, r.Config)
		items = append(items, r)
	}
	return DetailResponse{Response: s.landingResponse(ctx, p), Sections: items}, nil
}

func (s *Service) mediaURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := s.files.URL(ctx, *path)
	return &u
}

func mapGetErr(err error) error {
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	return apperr.Internal()
}

func mapWriteErr(err error) error {
	if errors.Is(err, shared.ErrConflict) {
		return apperr.Unprocessable("key_already_exists")
	}
	if errors.Is(err, shared.ErrOptLock) {
		return apperr.Conflict("conflict")
	}
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	return apperr.Internal()
}
