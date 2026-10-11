package catalog

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// defaultMaxUploadMB bounds an upload when the settings registry has no
// explicit storage.max_upload_mb.
const defaultMaxUploadMB = 10

// uploadPurposes is the closed set of roles an uploaded image may play. It is
// also the filename prefix, which is what makes inline-media GC possible later:
// "inline-*" files are the ones a body edit can orphan.
var uploadPurposes = map[string]bool{"cover": true, "og": true, "inline": true}

// MaxUploadBytes returns the upload cap so the handler can bound the request
// body before reading it.
func (s *Service) MaxUploadBytes(ctx context.Context) int {
	mb := 0
	if s.settings != nil {
		mb = s.settings.GetInt(ctx, "storage.max_upload_mb")
	}
	if mb <= 0 {
		mb = defaultMaxUploadMB
	}
	return mb << 20
}

// UploadMedia stores an image under the product's own folder and returns both
// the storage path (which the client echoes back in cover_path / og_path) and a
// URL to render immediately. Requires products.edit.
//
// The path is derived server-side from the product id — a client never chooses
// where its bytes land, so one product cannot write into another's folder.
func (s *Service) UploadMedia(ctx context.Context, id *httpx.Identity, productID uuid.UUID, purpose string, r io.Reader) (UploadResponse, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return UploadResponse{}, err
	}
	if !uploadPurposes[purpose] {
		return UploadResponse{}, apperr.Validation(map[string]string{"purpose": "invalid"})
	}
	// Confirms the product exists before writing bytes for it.
	if _, err := s.repo.Get(ctx, productID); err != nil {
		return UploadResponse{}, s.MapRepoErr(ctx, "upload: load product", err)
	}

	maxBytes := s.MaxUploadBytes(ctx)
	// Read one byte past the cap so an over-limit upload is detectable.
	buf, err := io.ReadAll(io.LimitReader(r, int64(maxBytes)+1))
	if err != nil {
		return UploadResponse{}, apperr.Internal()
	}
	if len(buf) > maxBytes {
		return UploadResponse{}, apperr.New(413, "payload_too_large")
	}
	ext, ok := sniffImage(buf)
	if !ok {
		return UploadResponse{}, apperr.New(415, "unsupported_media_type")
	}

	key := fmt.Sprintf("%s%s-%s.%s", mediaPrefix(productID), purpose, uuid.NewString(), ext)
	if err := s.store.Save(ctx, key, bytes.NewReader(buf)); err != nil {
		s.Sec(ctx).Error("products: media save failed", "product_id", productID, "err", err)
		return UploadResponse{}, apperr.Internal()
	}
	return UploadResponse{Path: key, URL: *s.mediaURL(ctx, &key)}, nil
}

// sniffImage detects the image type by magic bytes (never trusting the client
// Content-Type) and returns the canonical extension. Allowlist: png/jpg/webp/gif.
func sniffImage(b []byte) (ext string, ok bool) {
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
