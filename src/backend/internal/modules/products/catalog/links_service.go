package catalog

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/media"
)

// --- Categories ---

// SetCategories replaces a product's category set. Requires products.edit.
func (s *Service) SetCategories(ctx context.Context, id *httpx.Identity, productID uuid.UUID, ids []uuid.UUID) ([]CategoryRef, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return nil, err
	}
	if _, err := s.repo.Get(ctx, productID); err != nil {
		return nil, s.MapRepoErr(ctx, "set categories: load product", err)
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	unique := make([]uuid.UUID, 0, len(ids))
	for _, cid := range ids {
		if _, dup := seen[cid]; dup {
			continue // the same category twice means the same thing once
		}
		seen[cid] = struct{}{}
		unique = append(unique, cid)
	}
	if err := s.links.SetCategories(ctx, productID, unique); err != nil {
		if errors.Is(err, shared.ErrLinkTargetMissing) {
			return nil, apperr.Validation(map[string]string{"category_ids": "not_found"})
		}
		return nil, s.MapRepoErr(ctx, "set categories", err)
	}
	return s.categoriesOf(ctx, productID)
}

func (s *Service) categoriesOf(ctx context.Context, productID uuid.UUID) ([]CategoryRef, error) {
	cats, err := s.links.Categories(ctx, productID)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "list categories", err)
	}
	return cats, nil
}

// --- Members ---

// SetMembers replaces a product's member list. Position in the slice is the
// display order. Requires products.edit.
func (s *Service) SetMembers(ctx context.Context, id *httpx.Identity, productID uuid.UUID, links []MemberLinkInput) ([]MemberRef, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return nil, err
	}
	if _, err := s.repo.Get(ctx, productID); err != nil {
		return nil, s.MapRepoErr(ctx, "set members: load product", err)
	}

	seen := make(map[uuid.UUID]struct{}, len(links))
	clean := make([]MemberLinkInput, 0, len(links))
	for i, l := range links {
		if _, dup := seen[l.MemberID]; dup {
			// Unlike categories, a duplicate here is ambiguous — which of the two
			// roles wins? — so it is the client's mistake to fix.
			return nil, apperr.Validation(map[string]string{
				fmt.Sprintf("members.%d.member_id", i): "duplicate",
			})
		}
		seen[l.MemberID] = struct{}{}
		clean = append(clean, MemberLinkInput{MemberID: l.MemberID, Role: trimPtr(l.Role)})
	}

	if err := s.links.SetMembers(ctx, productID, clean); err != nil {
		if errors.Is(err, shared.ErrLinkTargetMissing) {
			return nil, apperr.Validation(map[string]string{"members": "not_found"})
		}
		return nil, s.MapRepoErr(ctx, "set members", err)
	}
	return s.membersOf(ctx, productID)
}

func (s *Service) membersOf(ctx context.Context, productID uuid.UUID) ([]MemberRef, error) {
	members, err := s.links.Members(ctx, productID)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "list members", err)
	}
	for i := range members {
		members[i].AvatarURL = s.mediaURL(ctx, members[i].avatarPath)
	}
	return members, nil
}

// --- Gallery ---

// Gallery returns a product's media. Requires products.view.
func (s *Service) Gallery(ctx context.Context, id *httpx.Identity, productID uuid.UUID) ([]MediaItem, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return nil, err
	}
	return s.galleryOf(ctx, productID)
}

func (s *Service) galleryOf(ctx context.Context, productID uuid.UUID) ([]MediaItem, error) {
	items, err := s.links.Media(ctx, productID)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "list media", err)
	}
	for i := range items {
		items[i].URL = s.mediaURL(ctx, items[i].path)
	}
	return items, nil
}

// AddGalleryImage uploads an image and appends it to the gallery in one step:
// a stored file with no row would be an orphan nobody can see or delete.
// Requires products.edit.
func (s *Service) AddGalleryImage(ctx context.Context, id *httpx.Identity, productID uuid.UUID, caption, device *string, r io.Reader) (MediaItem, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return MediaItem{}, err
	}
	if _, err := s.repo.Get(ctx, productID); err != nil {
		return MediaItem{}, s.MapRepoErr(ctx, "gallery: load product", err)
	}

	maxBytes := s.MaxUploadBytes(ctx)
	buf, err := io.ReadAll(io.LimitReader(r, int64(maxBytes)+1))
	if err != nil {
		return MediaItem{}, apperr.Internal()
	}
	if len(buf) > maxBytes {
		return MediaItem{}, apperr.New(413, "payload_too_large")
	}
	ext, ok := sniffImage(buf)
	if !ok {
		return MediaItem{}, apperr.New(415, "unsupported_media_type")
	}

	key := fmt.Sprintf("%sgallery-%s.%s", mediaPrefix(productID), uuid.NewString(), ext)
	if err := s.store.Save(ctx, key, bytes.NewReader(buf)); err != nil {
		s.Sec(ctx).Error("products: gallery save failed", "product_id", productID, "err", err)
		return MediaItem{}, apperr.Internal()
	}
	item, err := s.links.AddMedia(ctx, productID, MediaImage, &key, nil, trimPtr(caption), device)
	if err != nil {
		_ = s.store.Delete(ctx, key) // roll back the just-saved file
		return MediaItem{}, s.MapRepoErr(ctx, "gallery: add image", err)
	}
	// Named mintedURL, not url: this file imports net/url.
	mintedURL := media.MintOr(ctx, s.Media(), media.MintInput{
		Key: key, Base: "gallery", Data: buf, OwnerKind: "product", OwnerID: &productID,
	}, "")
	item.URL = s.mediaURL(ctx, item.path)
	if mintedURL != "" {
		item.URL = &mintedURL
	}
	return *item, nil
}

// AddGalleryVideo appends an embedded video. Requires products.edit.
func (s *Service) AddGalleryVideo(ctx context.Context, id *httpx.Identity, productID uuid.UUID, req AddVideoRequest) (MediaItem, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return MediaItem{}, err
	}
	if _, err := s.repo.Get(ctx, productID); err != nil {
		return MediaItem{}, s.MapRepoErr(ctx, "gallery: load product", err)
	}
	raw := strings.TrimSpace(req.VideoURL)
	if !isEmbeddableVideo(raw) {
		return MediaItem{}, apperr.Validation(map[string]string{"video_url": "unsupported_host"})
	}
	item, err := s.links.AddMedia(ctx, productID, MediaVideo, nil, &raw, trimPtr(req.Caption), req.Device)
	if err != nil {
		return MediaItem{}, s.MapRepoErr(ctx, "gallery: add video", err)
	}
	return *item, nil
}

// UpdateGalleryItem edits what describes one entry: its caption and which
// device tab it belongs to. Requires products.edit. Both are replaced by what
// the request carries, so a field left out is cleared.
func (s *Service) UpdateGalleryItem(ctx context.Context, id *httpx.Identity, productID, mediaID uuid.UUID, req UpdateMediaRequest) (MediaItem, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return MediaItem{}, err
	}
	item, err := s.links.UpdateMedia(ctx, productID, mediaID, trimPtr(req.Caption), req.Device, req.IsHero)
	if err != nil {
		return MediaItem{}, s.MapRepoErr(ctx, "gallery: update item", err)
	}
	// One hero per device. Clearing the others AFTER the promotion means the
	// worst a failure here can leave is two flagged captures, which the site
	// resolves by taking the first — rather than none at all, which is what
	// clearing first would risk.
	if item.IsHero {
		if err := s.links.ClearHero(ctx, productID, item.ID, item.Device); err != nil {
			return MediaItem{}, s.MapRepoErr(ctx, "gallery: clear hero", err)
		}
	}
	item.URL = s.mediaURL(ctx, item.path)
	return *item, nil
}

// DeleteGalleryItem removes one entry and, for an image, its file. Requires
// products.edit.
func (s *Service) DeleteGalleryItem(ctx context.Context, id *httpx.Identity, productID, mediaID uuid.UUID) error {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return err
	}
	item, err := s.links.DeleteMedia(ctx, productID, mediaID)
	if err != nil {
		return s.MapRepoErr(ctx, "gallery: delete", err)
	}
	// Scoped to the product's own folder, so a stored path from elsewhere is
	// left alone even if one somehow got in.
	if item.path != nil && shared.OwnsMedia(mediaPrefix(productID), *item.path) {
		if err := s.store.Delete(ctx, *item.path); err != nil {
			s.Sec(ctx).Warn("products: gallery file delete failed", "path", *item.path, "err", err)
		}
		media.Forget(ctx, s.MediaForget(), *item.path)
	}
	return nil
}

// ReorderGallery rewrites the display order. Requires products.edit.
func (s *Service) ReorderGallery(ctx context.Context, id *httpx.Identity, productID uuid.UUID, ids []uuid.UUID) ([]MediaItem, error) {
	if err := s.Require(ctx, id, permEdit); err != nil {
		return nil, err
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	for _, i := range ids {
		if _, dup := seen[i]; dup {
			return nil, apperr.Validation(map[string]string{"ids": "duplicate"})
		}
		seen[i] = struct{}{}
	}
	if err := s.links.ReorderMedia(ctx, productID, ids); err != nil {
		return nil, s.MapRepoErr(ctx, "gallery: reorder", err)
	}
	return s.galleryOf(ctx, productID)
}

// isEmbeddableVideo reports whether raw is an https URL on a host the site is
// willing to put inside an <iframe>. Anything else — another scheme, another
// host — is refused rather than embedded.
func isEmbeddableVideo(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if strings.ToLower(u.Scheme) != "https" {
		return false
	}
	return embedHosts[strings.ToLower(u.Host)]
}
