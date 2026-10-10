package account

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

const defaultMaxUploadMB = 10

// UploadAvatar validates and stores a new avatar (png/jpg/webp), updates the
// caller's avatar_path, and best-effort deletes the previous file.
func (s *Service) UploadAvatar(ctx context.Context, id *httpx.Identity, r io.Reader) (string, error) {
	if id == nil {
		return "", apperr.Unauthorized("unauthorized")
	}
	if err := s.allow(ctx, "account:avatar:user:"+id.UserID.String(), rlAvatar, rlAvatarWindow); err != nil {
		return "", err
	}
	maxBytes := s.maxUploadBytes(ctx)

	// Read up to maxBytes+1 so we can detect an over-limit upload. Avatars are
	// small; reading into memory keeps validation simple and correct.
	buf, err := io.ReadAll(io.LimitReader(r, int64(maxBytes)+1))
	if err != nil {
		return "", apperr.Internal()
	}
	if len(buf) > maxBytes {
		return "", apperr.New(413, "payload_too_large")
	}
	ext, ok := sniffImage(buf)
	if !ok {
		return "", apperr.New(415, "unsupported_media_type")
	}

	key := fmt.Sprintf("users/%s/avatar-%s.%s", id.UserID, uuid.NewString(), ext)
	if err := s.store.Save(ctx, key, bytes.NewReader(buf)); err != nil {
		s.sec(ctx).Error("avatar: save failed", "user_id", id.UserID, "err", err)
		return "", apperr.Internal()
	}

	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if err != nil {
		_ = s.store.Delete(ctx, key) // roll back the just-saved file
		return "", apperr.Internal()
	}
	old := user.AvatarPath
	if err := s.repo.UpdateAvatarPath(ctx, id.UserID, &key); err != nil {
		_ = s.store.Delete(ctx, key)
		return "", apperr.Internal()
	}
	if old != nil && *old != "" {
		if err := s.store.Delete(ctx, *old); err != nil {
			s.sec(ctx).Warn("avatar: delete old failed", "user_id", id.UserID, "err", err)
		}
	}
	return *s.avatarURL(ctx, &key), nil
}

// DeleteAvatar clears the caller's avatar (path → NULL + best-effort file delete).
func (s *Service) DeleteAvatar(ctx context.Context, id *httpx.Identity) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if err != nil {
		return apperr.Internal()
	}
	old := user.AvatarPath
	if err := s.repo.UpdateAvatarPath(ctx, id.UserID, nil); err != nil {
		return apperr.Internal()
	}
	if old != nil && *old != "" {
		if err := s.store.Delete(ctx, *old); err != nil {
			s.sec(ctx).Warn("avatar: delete failed", "user_id", id.UserID, "err", err)
		}
	}
	return nil
}

func (s *Service) maxUploadBytes(ctx context.Context) int {
	mb := s.settings.GetInt(ctx, "storage.max_upload_mb")
	if mb <= 0 {
		mb = defaultMaxUploadMB
	}
	return mb << 20
}

// AvatarMaxBytes returns the avatar size cap in bytes (from settings). The
// handler uses it to bound the multipart body before parsing, instead of a
// fixed oversized cap.
func (s *Service) AvatarMaxBytes(ctx context.Context) int { return s.maxUploadBytes(ctx) }

// sniffImage detects the image type by magic bytes (never trusting the
// client Content-Type) and returns the canonical extension. Allowlist:
// png / jpg / webp.
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
