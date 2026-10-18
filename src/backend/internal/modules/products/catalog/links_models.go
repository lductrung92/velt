package catalog

import (
	"time"

	"github.com/google/uuid"
)

// Media kinds. A gallery entry is either an uploaded image or an embedded
// video — never both, which the DB enforces with a XOR check.
const (
	MediaImage = "image"
	MediaVideo = "video"
)

// embedHosts is the allowlist for a gallery video. The URL ends up in an
// <iframe src> on the public site, so an arbitrary host would be an embedding
// hole; only the two providers the team actually uses are accepted.
var embedHosts = map[string]bool{
	"youtube.com": true, "www.youtube.com": true, "youtu.be": true,
	"vimeo.com": true, "www.vimeo.com": true, "player.vimeo.com": true,
}

// --- Domain rows (internal) ---

// CategoryRef is a category as seen from a product.
type CategoryRef struct {
	ID   uuid.UUID `json:"id"`
	Slug string    `json:"slug"`
	Name string    `json:"name"`
}

// MemberRef is a member as seen from a product, carrying the role they played
// on THIS product (empty → the site falls back to their general role).
type MemberRef struct {
	ID       uuid.UUID `json:"id"`
	Slug     string    `json:"slug"`
	FullName string    `json:"full_name"`
	// DisplayName is the public name, empty when the member has not been
	// given one. Both travel because the console credits people by their real
	// name and the site must not — see migration 0051.
	DisplayName string  `json:"display_name"`
	Role        *string `json:"role"`
	AvatarURL   *string `json:"avatar_url"`
	SortOrder   int     `json:"sort_order"`
	// avatarPath stays internal; the response exposes only the built URL.
	avatarPath *string
}

// MediaItem is one gallery entry.
type MediaItem struct {
	ID       uuid.UUID `json:"id"`
	Kind     string    `json:"kind"`
	URL      *string   `json:"url"`       // image only — built from path
	VideoURL *string   `json:"video_url"` // video only
	Caption  *string   `json:"caption"`
	// Which device shell the site frames this capture in. Null until somebody
	// says; the site used to guess it from the caption (migration 0052).
	Device *string `json:"device"`
	// Whether this is the capture the hero shows for that device.
	IsHero    bool      `json:"is_hero"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	// path stays internal; the response exposes only the built URL.
	path *string
}

// --- Request DTOs ---

// SetCategoriesRequest replaces a product's whole category set. An empty list
// is valid: an uncategorised product is a legitimate state.
type SetCategoriesRequest struct {
	CategoryIDs []uuid.UUID `json:"category_ids" validate:"omitempty,max=50"`
}

// MemberLinkInput is one entry of the member list. Order in the array is the
// display order, so the client never computes sort_order itself.
type MemberLinkInput struct {
	MemberID uuid.UUID `json:"member_id" validate:"required"`
	Role     *string   `json:"role" validate:"omitempty,max=160"`
}

// SetMembersRequest replaces a product's whole member list.
type SetMembersRequest struct {
	Members []MemberLinkInput `json:"members" validate:"omitempty,max=50,dive"`
}

// AddVideoRequest appends an embedded video to the gallery.
type AddVideoRequest struct {
	VideoURL string  `json:"video_url" validate:"required,max=500"`
	Caption  *string `json:"caption" validate:"omitempty,max=300"`
	Device   *string `json:"device" validate:"omitempty,oneof=phone tablet desktop"`
}

// UpdateMediaRequest edits a gallery entry. The source itself is replaced by
// deleting and re-adding, which keeps the XOR honest; what can be edited in
// place is what describes the entry.
//
// The request carries the WHOLE editable state: a field left out is cleared,
// which is how the caption has always behaved here. So a client moving a
// screenshot to another device tab sends its caption back with it.
type UpdateMediaRequest struct {
	Caption *string `json:"caption" validate:"omitempty,max=300"`
	Device  *string `json:"device" validate:"omitempty,oneof=phone tablet desktop"`
	// Absent means "leave the hero flag as it is": the caption field and the
	// hero checkbox are edited from different places in the console, and a
	// caption edit must not quietly un-feature a picture.
	IsHero *bool `json:"is_hero"`
}

// ReorderMediaRequest is the full id list in the desired display order.
type ReorderMediaRequest struct {
	IDs []uuid.UUID `json:"ids" validate:"required,min=1,max=200"`
}

// Devices are the gallery tabs. Laptop and desktop monitor share one: both
// show the wide layout, and a team does not capture the same screen twice.
const (
	DevicePhone   = "phone"
	DeviceTablet  = "tablet"
	DeviceDesktop = "desktop"
)

// validDevice guards the multipart upload, where there is no struct tag to do
// it. The JSON endpoints use `oneof` above, and the column has a CHECK; this
// is the third gate on the one path that would otherwise reach it unchecked.
func validDevice(v string) bool {
	return v == DevicePhone || v == DeviceTablet || v == DeviceDesktop
}
