package articles

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/storage"
)

const defaultMaxUploadMB = 10

// articleMediaPrefix is the storage folder that owns an article's uploaded media.
// Every media key an article can legitimately reference lives under it; used both
// to build upload keys and to reject/scope client-supplied *_path values.
func articleMediaPrefix(id uuid.UUID) string {
	return fmt.Sprintf("cms/articles/%s/", id)
}

// validUploadPurpose limits which media slot an upload targets.
var validUploadPurpose = map[string]bool{"featured": true, "og": true, "inline": true}

// UploadMediaResponse is returned by POST /api/cms/articles/{id}/upload: the
// stored path + the served URL to render immediately.
type UploadMediaResponse struct {
	Path string `json:"path"`
	URL  string `json:"url"`
}

// MaxUploadBytes is the image size cap (settings storage.max_upload_mb, default
// 10 MB). The handler uses it to bound the multipart body before parsing.
func (s *Service) MaxUploadBytes(ctx context.Context) int {
	mb := s.GetInt(ctx, "storage.max_upload_mb")
	if mb <= 0 {
		mb = defaultMaxUploadMB
	}
	return mb << 20
}

// UploadArticleMedia validates + stores an image for an article (featured / og /
// inline). Requires cms.article.edit + ABAC ownership; an editor cannot upload to
// a published/scheduled article. The file is type-sniffed by magic bytes
// (jpeg/png/webp/gif; SVG rejected) and size-capped. Returns the stored path +
// served URL — persisting the path is a separate PATCH.
//
// Privacy model (intentional, see cmd/api/main.go files handler): the returned
// URL is served PUBLICLY under /api/files/cms/ with no auth and no published-state
// gate — media uploaded to a draft article is reachable by anyone with the URL.
// The only protection is the unguessable random uuid in the key. This is accepted
// because article media is authored to become public content.
func (s *Service) UploadArticleMedia(ctx context.Context, id *httpx.Identity, articleID uuid.UUID, purpose string, r io.Reader) (UploadMediaResponse, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return UploadMediaResponse{}, err
	}
	if !validUploadPurpose[purpose] {
		return UploadMediaResponse{}, apperr.Validation(map[string]string{"purpose": "invalid_value"})
	}
	cur, err := s.getOwned(ctx, id, articleID)
	if err != nil {
		return UploadMediaResponse{}, err
	}
	if !s.isReviewer(id) && (cur.Status == ArticleStatusPublished || cur.Status == ArticleStatusScheduled) {
		return UploadMediaResponse{}, apperr.Unprocessable("invalid_status_transition")
	}

	maxBytes := s.MaxUploadBytes(ctx)
	// Read up to maxBytes+1 so an over-limit upload is detectable.
	buf, err := io.ReadAll(io.LimitReader(r, int64(maxBytes)+1))
	if err != nil {
		return UploadMediaResponse{}, apperr.Internal()
	}
	if len(buf) > maxBytes {
		return UploadMediaResponse{}, apperr.New(413, "payload_too_large")
	}
	ext, ok := sniffImageExt(buf)
	if !ok {
		return UploadMediaResponse{}, apperr.New(415, "unsupported_media_type")
	}

	key := fmt.Sprintf("%s%s-%s.%s", articleMediaPrefix(articleID), purpose, uuid.NewString(), ext)
	if err := s.files.Save(ctx, key, bytes.NewReader(buf)); err != nil {
		s.Sec(ctx).Error("cms media: save failed", "article", articleID, "err", err)
		return UploadMediaResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms media uploaded", "actor", id.UserID, "article", articleID, "purpose", purpose)
	return UploadMediaResponse{Path: key, URL: s.files.URL(ctx, key)}, nil
}

// gcInlineMedia reclaims inline body images no longer referenced by the article's
// body HTML. It reconciles the WHOLE media folder against the current body (not an
// old→new diff), so an image uploaded then removed before the save — a side effect
// of upload-on-insert in the editor — is cleaned up too. featured-*/og-* live in
// dedicated columns (reclaimed via shared.DeleteOldMedia) and are skipped here.
// Best-effort + no-op when the store can't list. An <img> src is the served URL,
// which embeds the storage key, so a key still present in the HTML is "live".
func (s *Service) gcInlineMedia(ctx context.Context, articleID uuid.UUID, bodyHTML string) {
	lister, ok := s.files.(interface {
		List(ctx context.Context, prefix string) ([]storage.Entry, error)
	})
	if !ok {
		return
	}
	prefix := articleMediaPrefix(articleID)
	entries, err := lister.List(ctx, prefix)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir || !strings.HasPrefix(path.Base(e.Path), "inline-") {
			continue
		}
		if strings.Contains(bodyHTML, e.Path) {
			continue // still referenced by an <img src=…/inline-…>
		}
		_ = s.files.Delete(ctx, e.Path)
	}
}

// sniffImageExt detects the image type by magic bytes (never trusting the client
// Content-Type) and returns the canonical extension. Allowlist: jpg/png/webp/gif.
func sniffImageExt(b []byte) (ext string, ok bool) {
	switch {
	case len(b) >= 8 && bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		return "png", true
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return "jpg", true
	case len(b) >= 12 && bytes.Equal(b[0:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")):
		return "webp", true
	case len(b) >= 6 && (bytes.HasPrefix(b, []byte("GIF87a")) || bytes.HasPrefix(b, []byte("GIF89a"))):
		return "gif", true
	default:
		return "", false
	}
}
