package members

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/mail"
	"net/url"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/storage"
)

// defaultMaxUploadMB bounds an avatar upload when the settings registry has no
// explicit storage.max_upload_mb.
const defaultMaxUploadMB = 10

// SettingsPort reads integer settings (the upload cap). Satisfied by the
// settings service; declared here so members stays decoupled.
type SettingsPort interface {
	GetInt(ctx context.Context, key string) int
}

// Options configures the service.
type Options struct {
	Logger *slog.Logger
}

// Service holds the members business rules.
type Service struct {
	repo     Repository
	store    storage.Storage
	urls     storage.URLer
	settings SettingsPort
	tr       Translator
	log      *slog.Logger
}

// NewService wires the members service. store and urls are the same storage
// Manager in production; they are separate parameters so a test can supply a
// write-only stub.
func NewService(repo Repository, store storage.Storage, urls storage.URLer, settings SettingsPort, opts Options) *Service {
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	return &Service{repo: repo, store: store, urls: urls, settings: settings, log: opts.Logger}
}

// require enforces the per-endpoint permission gate using the caller's resolved
// claims (the wildcard "*" passes). Denials are logged to the security log.
func (s *Service) require(ctx context.Context, id *httpx.Identity, perm string) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	if id.Has(perm) {
		return nil
	}
	s.sec(ctx).Warn("members action denied", "actor", id.UserID, "action", "permission:"+perm)
	return apperr.AccessDenied("access_denied")
}

func (s *Service) sec(ctx context.Context) *slog.Logger {
	return s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

// mapRepoErr converts repository sentinels into wire errors. Anything else is a
// genuine fault and becomes a 500 (details stay in the log, not the response).
func (s *Service) mapRepoErr(ctx context.Context, op string, err error) error {
	switch {
	case errors.Is(err, ErrNotFound):
		return apperr.NotFound("not_found")
	case errors.Is(err, ErrConflict):
		return apperr.Validation(map[string]string{"slug": "taken"})
	default:
		s.sec(ctx).Error("members: "+op, "err", err)
		return apperr.Internal()
	}
}

// --- Reads ---

// List returns a page of members for the console. Requires members.view.
func (s *Service) List(ctx context.Context, id *httpx.Identity, p ListParams) (ListResponse, error) {
	if err := s.require(ctx, id, permView); err != nil {
		return ListResponse{}, err
	}
	return s.list(ctx, p)
}

// ListPublic returns active members for the public site. No auth, no permission.
// p.Locale picks the language; anything not configured serves Vietnamese.
func (s *Service) ListPublic(ctx context.Context, p ListParams) (ListResponse, error) {
	p.ActiveOnly = true
	res, err := s.list(ctx, p)
	if err != nil {
		return ListResponse{}, err
	}
	locale := s.resolveLocale(ctx, p.Locale)
	if locale == baseLocale {
		return res, nil
	}
	ids := make([]uuid.UUID, len(res.Items))
	for i := range res.Items {
		ids[i] = res.Items[i].ID
	}
	byID := s.translations(ctx, locale, ids)
	for i := range res.Items {
		overlayMember(&res.Items[i], byID[res.Items[i].ID])
	}
	return res, nil
}

func (s *Service) list(ctx context.Context, p ListParams) (ListResponse, error) {
	p.Page, p.PageSize = normalizePage(p.Page, p.PageSize)
	rows, total, err := s.repo.List(ctx, p)
	if err != nil {
		return ListResponse{}, s.mapRepoErr(ctx, "list", err)
	}
	items := make([]Response, 0, len(rows))
	for _, m := range rows {
		items = append(items, s.toResponse(ctx, m))
	}
	return ListResponse{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// Get returns one member by id. Requires members.view.
func (s *Service) Get(ctx context.Context, id *httpx.Identity, memberID uuid.UUID) (Response, error) {
	if err := s.require(ctx, id, permView); err != nil {
		return Response{}, err
	}
	m, err := s.repo.Get(ctx, memberID)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "get", err)
	}
	return s.toResponse(ctx, *m), nil
}

// GetPublicBySlug returns one ACTIVE member by slug for the public site. A
// hidden member is reported as not found: whether a profile exists but is
// hidden is not public information.
func (s *Service) GetPublicBySlug(ctx context.Context, locale, slug string) (Response, error) {
	m, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "get by slug", err)
	}
	if !m.IsActive {
		return Response{}, apperr.NotFound("not_found")
	}
	res := s.toResponse(ctx, *m)
	if loc := s.resolveLocale(ctx, locale); loc != baseLocale {
		overlayMember(&res, s.translations(ctx, loc, []uuid.UUID{m.ID})[m.ID])
	}
	return res, nil
}

// --- Writes ---

// Create adds a member. Requires members.manage.
func (s *Service) Create(ctx context.Context, id *httpx.Identity, req CreateRequest) (Response, error) {
	if err := s.require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	name := strings.TrimSpace(req.FullName)
	if name == "" {
		return Response{}, apperr.Validation(map[string]string{"full_name": "required"})
	}
	links, err := toLinks(req.Links)
	if err != nil {
		return Response{}, err
	}
	zalo, ok := trimURLPtr(req.Zalo)
	if !ok {
		return Response{}, apperr.Validation(map[string]string{"zalo": "invalid_scheme"})
	}
	email, ok := trimEmailPtr(req.Email)
	if !ok {
		return Response{}, apperr.Validation(map[string]string{"email": "invalid_email"})
	}
	slug, err := s.resolveSlug(ctx, req.Slug, name, nil)
	if err != nil {
		return Response{}, err
	}
	w := write{
		Slug:     slug,
		FullName: name,
		Role:     trimPtr(req.Role),
		Bio:      trimPtr(req.Bio),
		Email:    email,
		Zalo:     zalo,
		Links:    links,
		Skills:   cleanStrings(req.Skills),
		IsActive: req.IsActive == nil || *req.IsActive,
		// nil → repository appends to the end of the roster
	}
	m, err := s.repo.Create(ctx, w)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "create", err)
	}
	return s.toResponse(ctx, *m), nil
}

// Update applies a PATCH onto the current row. Requires members.manage.
func (s *Service) Update(ctx context.Context, id *httpx.Identity, memberID uuid.UUID, req UpdateRequest) (Response, error) {
	if err := s.require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, memberID)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "update: load", err)
	}

	name := cur.FullName
	if req.FullName != nil {
		name = strings.TrimSpace(*req.FullName)
		if name == "" {
			return Response{}, apperr.Validation(map[string]string{"full_name": "required"})
		}
	}

	slug := cur.Slug
	if req.Slug != nil {
		slug, err = s.resolveSlug(ctx, req.Slug, name, &memberID)
		if err != nil {
			return Response{}, err
		}
	}

	sortOrder := cur.SortOrder
	w := write{
		Slug:      slug,
		FullName:  name,
		Role:      pickPtr(req.Role, cur.Role),
		Bio:       pickPtr(req.Bio, cur.Bio),
		Email:     cur.Email,
		Zalo:      cur.Zalo,
		Links:     cur.Links,
		Skills:    cur.Skills,
		SortOrder: &sortOrder,
		IsActive:  cur.IsActive,
	}
	if req.Email != nil {
		em, ok := trimEmailPtr(req.Email)
		if !ok {
			return Response{}, apperr.Validation(map[string]string{"email": "invalid_email"})
		}
		w.Email = em
	}
	if req.Zalo != nil {
		z, ok := trimURLPtr(req.Zalo)
		if !ok {
			return Response{}, apperr.Validation(map[string]string{"zalo": "invalid_scheme"})
		}
		w.Zalo = z
	}
	if req.Links != nil {
		if w.Links, err = toLinks(*req.Links); err != nil {
			return Response{}, err
		}
	}
	if req.Skills != nil {
		w.Skills = cleanStrings(*req.Skills)
	}
	if req.IsActive != nil {
		w.IsActive = *req.IsActive
	}

	m, err := s.repo.Update(ctx, memberID, w)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "update", err)
	}
	return s.toResponse(ctx, *m), nil
}

// Delete removes a member and best-effort purges their avatar. Their
// product links cascade away — hide with is_active=false instead when the
// contribution history matters (docs/domains/members/README.md §2).
func (s *Service) Delete(ctx context.Context, id *httpx.Identity, memberID uuid.UUID) error {
	if err := s.require(ctx, id, permManage); err != nil {
		return err
	}
	cur, err := s.repo.Get(ctx, memberID)
	if err != nil {
		return s.mapRepoErr(ctx, "delete: load", err)
	}
	if err := s.repo.Delete(ctx, memberID); err != nil {
		return s.mapRepoErr(ctx, "delete", err)
	}
	s.deleteFile(ctx, cur.AvatarPath)
	s.purgeTranslations(ctx, memberID)
	return nil
}

// Reorder rewrites the roster display order. Requires members.manage.
func (s *Service) Reorder(ctx context.Context, id *httpx.Identity, ids []uuid.UUID) error {
	if err := s.require(ctx, id, permManage); err != nil {
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
		return s.mapRepoErr(ctx, "reorder", err)
	}
	return nil
}

// --- Avatar ---

// AvatarMaxBytes returns the upload cap so the handler can bound the request
// body before reading it.
func (s *Service) AvatarMaxBytes(ctx context.Context) int {
	mb := 0
	if s.settings != nil {
		mb = s.settings.GetInt(ctx, "storage.max_upload_mb")
	}
	if mb <= 0 {
		mb = defaultMaxUploadMB
	}
	return mb << 20
}

// UploadAvatar validates and stores a new avatar, points the member at it, and
// best-effort deletes the previous file. Requires members.manage.
func (s *Service) UploadAvatar(ctx context.Context, id *httpx.Identity, memberID uuid.UUID, r io.Reader) (Response, error) {
	if err := s.require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, memberID)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "avatar: load", err)
	}

	maxBytes := s.AvatarMaxBytes(ctx)
	// Read one byte past the cap so an over-limit upload is detectable. Avatars
	// are small, so buffering in memory keeps validation simple and correct.
	buf, err := io.ReadAll(io.LimitReader(r, int64(maxBytes)+1))
	if err != nil {
		return Response{}, apperr.Internal()
	}
	if len(buf) > maxBytes {
		return Response{}, apperr.New(413, "payload_too_large")
	}
	ext, ok := sniffImage(buf)
	if !ok {
		return Response{}, apperr.New(415, "unsupported_media_type")
	}

	key := fmt.Sprintf("%savatar-%s.%s", mediaPrefix(memberID), uuid.NewString(), ext)
	if err := s.store.Save(ctx, key, bytes.NewReader(buf)); err != nil {
		s.sec(ctx).Error("members: avatar save failed", "member_id", memberID, "err", err)
		return Response{}, apperr.Internal()
	}
	if err := s.repo.UpdateAvatarPath(ctx, memberID, &key); err != nil {
		_ = s.store.Delete(ctx, key) // roll back the just-saved file
		return Response{}, s.mapRepoErr(ctx, "avatar: update", err)
	}
	s.deleteFile(ctx, cur.AvatarPath)

	cur.AvatarPath = &key
	return s.toResponse(ctx, *cur), nil
}

// DeleteAvatar clears a member's avatar. Requires members.manage.
func (s *Service) DeleteAvatar(ctx context.Context, id *httpx.Identity, memberID uuid.UUID) (Response, error) {
	if err := s.require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, memberID)
	if err != nil {
		return Response{}, s.mapRepoErr(ctx, "avatar: load", err)
	}
	if err := s.repo.UpdateAvatarPath(ctx, memberID, nil); err != nil {
		return Response{}, s.mapRepoErr(ctx, "avatar: clear", err)
	}
	s.deleteFile(ctx, cur.AvatarPath)
	cur.AvatarPath = nil
	return s.toResponse(ctx, *cur), nil
}

// deleteFile best-effort removes a stored object; a failure is logged, never
// surfaced — the row already points elsewhere, so a leaked file is not a
// request failure.
func (s *Service) deleteFile(ctx context.Context, path *string) {
	if path == nil || *path == "" {
		return
	}
	if err := s.store.Delete(ctx, *path); err != nil {
		s.sec(ctx).Warn("members: delete old media failed", "path", *path, "err", err)
	}
}

// mediaPrefix is the storage folder that owns a member's uploaded media.
func mediaPrefix(id uuid.UUID) string { return "members/" + id.String() + "/" }

// sniffImage detects the image type by magic bytes (never trusting the client
// Content-Type) and returns the canonical extension. Allowlist: png/jpg/webp.
func sniffImage(b []byte) (ext string, ok bool) {
	switch {
	case len(b) >= 8 && bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		return "png", true
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return "jpg", true
	case len(b) >= 12 && bytes.Equal(b[0:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")):
		return "webp", true
	default:
		return "", false
	}
}

// --- Helpers ---

func (s *Service) toResponse(ctx context.Context, m Member) Response {
	return Response{
		ID: m.ID, Slug: m.Slug, FullName: m.FullName, Role: m.Role, Bio: m.Bio,
		AvatarURL: s.avatarURL(ctx, m.AvatarPath),
		Email:     m.Email, Zalo: m.Zalo, Links: m.Links, Skills: m.Skills,
		SortOrder: m.SortOrder, IsActive: m.IsActive,
		CreatedAt: m.CreatedAt, UpdatedAt: m.UpdatedAt,
	}
}

func (s *Service) avatarURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" || s.urls == nil {
		return nil
	}
	u := s.urls.URL(ctx, *path)
	return &u
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

// toLinks trims each link, rejects one left blank, and enforces an http(s)
// scheme.
//
// Two gaps in the struct validator make this necessary, and both end up in an
// <a href> on the public site:
//   - `required` cannot see that "   " is blank, so without this it would be
//     silently dropped while "" returns 422;
//   - `url` accepts ANY valid URI, including javascript: and data:, which is a
//     stored-XSS vector. Only http/https may reach the template.
func toLinks(in []LinkInput) ([]Link, error) {
	out := make([]Link, 0, len(in))
	for i, l := range in {
		label, raw := strings.TrimSpace(l.Label), strings.TrimSpace(l.URL)
		if label == "" {
			return nil, apperr.Validation(map[string]string{fmt.Sprintf("links.%d.label", i): "required"})
		}
		if raw == "" {
			return nil, apperr.Validation(map[string]string{fmt.Sprintf("links.%d.url", i): "required"})
		}
		if !isHTTPURL(raw) {
			return nil, apperr.Validation(map[string]string{fmt.Sprintf("links.%d.url", i): "invalid_scheme"})
		}
		out = append(out, Link{Label: label, URL: raw})
	}
	return out, nil
}

// isHTTPURL reports whether raw is an absolute http(s) URL with a host. Any
// other scheme (javascript:, data:, file:, …) is refused: these values are
// rendered as links on the public site.
func isHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(u.Scheme)
	return (scheme == "http" || scheme == "https") && u.Host != ""
}

// trimEmailPtr is trimPtr plus a format check. The struct validator cannot do
// this: the empty string is this API's "clear this field" sentinel, and
// `omitempty` still runs the email rule on a pointer to "". Returns ok=false
// when the value is present but not a parsable address.
func trimEmailPtr(v *string) (*string, bool) {
	t := trimPtr(v)
	if t == nil {
		return nil, true
	}
	if _, err := mail.ParseAddress(*t); err != nil {
		return nil, false
	}
	return t, true
}

// trimURLPtr is trimPtr plus the http(s) scheme check, for optional single-URL
// fields that the site renders as links (zalo). Returns a field error key when
// the value is present but unusable.
func trimURLPtr(v *string) (*string, bool) {
	t := trimPtr(v)
	if t == nil {
		return nil, true
	}
	if !isHTTPURL(*t) {
		return nil, false
	}
	return t, true
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
