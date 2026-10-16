package landing

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/media"
)

const defaultMaxUploadMB = 10

// landingMediaPrefix is the storage folder that owns a landing's uploaded media.
// Every media key a landing (og_path + section *_path) can legitimately reference
// lives under it; used to build upload keys and to scope client-supplied paths.
func landingMediaPrefix(id uuid.UUID) string {
	return fmt.Sprintf("cms/landing/%s/", id)
}

// UploadMediaResponse is returned by POST /api/cms/landing/{id}/upload: the stored
// path (to persist into a section config *_path field) + the served URL to render.
type UploadMediaResponse struct {
	Path string `json:"path"`
	URL  string `json:"url"`
}

// MaxUploadBytes is the image size cap (settings storage.max_upload_mb, default
// 10 MB). Used to bound the multipart body before parsing.
func (s *Service) MaxUploadBytes(ctx context.Context) int {
	mb := s.GetInt(ctx, "storage.max_upload_mb")
	if mb <= 0 {
		mb = defaultMaxUploadMB
	}
	return mb << 20
}

// UploadMedia validates + stores an image for a landing's builder sections.
// Requires cms.landing.manage. The file is type-sniffed by magic bytes
// (jpeg/png/webp/gif; SVG rejected) and size-capped. Returns the stored path +
// served URL — persisting the path into a section config is a separate call.
//
// Privacy model matches article media: the URL is served publicly under the CMS
// files prefix; the only protection is the unguessable uuid in the key. Landing
// media is authored to become public content, so this is intended.
func (s *Service) UploadMedia(ctx context.Context, id *httpx.Identity, landingID uuid.UUID, r io.Reader) (UploadMediaResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return UploadMediaResponse{}, err
	}
	if _, err := s.repo.GetLanding(ctx, landingID); err != nil {
		return UploadMediaResponse{}, mapGetErr(err)
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

	key := fmt.Sprintf("%s%s.%s", landingMediaPrefix(landingID), uuid.NewString(), ext)
	if err := s.files.Save(ctx, key, bytes.NewReader(buf)); err != nil {
		s.Sec(ctx).Error("cms landing media: save failed", "landing", landingID, "err", err)
		return UploadMediaResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms landing media uploaded", "actor", id.UserID, "landing", landingID)
	url := media.MintOr(ctx, s.Media(), media.MintInput{
		Key: key, Base: "section", Data: buf, OwnerKind: "landing", OwnerID: &landingID,
	}, s.files.URL(ctx, key))
	return UploadMediaResponse{Path: key, URL: url}, nil
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
