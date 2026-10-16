package media

import (
	"context"
	"strings"

	"github.com/velt/backend/internal/platform/storage"
)

// The READ-PATH mapping: what a public response says about an image it already
// knows about.
//
// Minting (mint.go) gives new uploads a slug, but every column written before
// that — featured_path, cover_path, an avatar path, a frozen gallery item —
// still holds a storage key, and every public response still answers with the
// legacy /api/files URL built from it. Backfilling the `files` table does not
// change that by itself: something has to look the key up at read time and say
// the new URL instead. That is this file.
//
// It also carries the half the old URL could never carry: the intrinsic width
// and height, so the site can reserve the space before the bytes arrive. That
// is the CLS item of design §1, and it is the reason the dimensions travel with
// the URL rather than being a separate call.

// Image is one asset as a public response should describe it.
type Image struct {
	URL    string
	Width  int
	Height int
}

// BulkRepository reads many `files` rows in ONE query. The interface exists in
// this shape rather than as a per-key lookup on purpose: a catalogue page of 20
// products must cost one round trip, not twenty.
type BulkRepository interface {
	ByStorageKeys(ctx context.Context, keys []string) ([]Record, error)
}

// PublicURLs upgrades the image URLs of a public response. A nil *PublicURLs is
// usable and answers nothing, which is exactly today's behaviour — every caller
// then leaves its existing field untouched.
type PublicURLs struct {
	repo BulkRepository
	urls URLs
	// legacy builds the URL the stored columns were rendered through. It is
	// needed to run that rendering BACKWARDS: some public payloads (a frozen
	// product snapshot, a landing section config) carry the built URL and have
	// thrown the storage key away.
	legacy storage.URLer
}

// NewPublicURLs builds the read-path mapping over the `files` table, the two
// configured public bases, and the legacy URL builder.
func NewPublicURLs(repo BulkRepository, urls URLs, legacy storage.URLer) *PublicURLs {
	return &PublicURLs{repo: repo, urls: urls, legacy: legacy}
}

// Resolve looks up every value a response holds for its images — a bare storage
// key ("cms/articles/…/featured-x.png") or a URL already built from one
// ("/api/files/cms/articles/…") — and returns, keyed by the value that was
// passed in, the media URL and intrinsic size of each one that has a row.
//
// A value with no row, an external URL, a non-image and a failed query are all
// simply ABSENT from the result. That is the contract the callers rely on: a
// missing entry means "leave this field exactly as it is and send no
// dimensions", so an un-backfilled or externally hosted image renders today's
// response rather than a blank or a 500.
func (p *PublicURLs) Resolve(ctx context.Context, values []string) map[string]Image {
	if p == nil || p.repo == nil || len(values) == 0 {
		return nil
	}
	prefix := p.legacyPrefix(ctx)
	keyOf := make(map[string]string, len(values))
	keys := make([]string, 0, len(values))
	for _, v := range values {
		k := storageKeyOf(v, prefix)
		if k == "" {
			continue
		}
		if _, dup := keyOf[v]; !dup {
			keyOf[v] = k
		}
		keys = append(keys, k)
	}
	if len(keys) == 0 {
		return nil
	}
	recs, err := p.repo.ByStorageKeys(ctx, dedupe(keys))
	if err != nil {
		return nil
	}
	byKey := make(map[string]Record, len(recs))
	for _, r := range recs {
		byKey[r.StorageKey] = r
	}
	out := make(map[string]Image, len(keyOf))
	for v, k := range keyOf {
		// A row that is not a decodable raster image has no /img URL to offer
		// and no dimensions to carry, so it is left as it is too.
		if r, ok := byKey[k]; ok && r.IsImage() {
			out[v] = Image{URL: p.urls.For(r), Width: r.Width, Height: r.Height}
		}
	}
	return out
}

// legacyProbe is a key the URL builder is asked about purely to see what it
// puts in front of one. It is never stored or served.
const legacyProbe = "probe"

// legacyPrefix is everything the legacy builder puts before a storage key —
// "/api/files/" for the local driver, the bucket endpoint for S3. It is read
// from the builder rather than hard-coded so the two cannot disagree, and so a
// deployment that moves its assets does not silently stop resolving them.
func (p *PublicURLs) legacyPrefix(ctx context.Context) string {
	if p.legacy == nil {
		return ""
	}
	full := p.legacy.URL(ctx, legacyProbe)
	if !strings.HasSuffix(full, legacyProbe) {
		return ""
	}
	return strings.TrimSuffix(full, legacyProbe)
}

// storageKeyOf recovers the storage key a response value refers to, or "" when
// it refers to none.
func storageKeyOf(value, prefix string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	if prefix != "" {
		if k, ok := strings.CutPrefix(v, prefix); ok {
			return k
		}
	}
	// Anything else that looks like an address belongs to somebody else — an
	// image pasted in from another site, or an asset already served under the
	// new flat URLs. Only a bare relative key is one of ours.
	if strings.Contains(v, "://") || strings.HasPrefix(v, "/") {
		return ""
	}
	return v
}

func dedupe(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, v := range in {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

// Collect appends a non-empty value to a lookup batch. It is the small
// bookkeeping every caller would otherwise write out by hand before calling
// Resolve.
func Collect(into *[]string, value *string) {
	if value != nil && *value != "" {
		*into = append(*into, *value)
	}
}

// Apply rewrites one field in place from a resolved batch and returns the
// intrinsic size to report alongside it. A value with no entry keeps the URL it
// already had and reports 0×0, which every caller renders as "no dimensions".
func Apply(found map[string]Image, field **string) (width, height int) {
	if found == nil || field == nil || *field == nil {
		return 0, 0
	}
	img, ok := found[**field]
	if !ok {
		return 0, 0
	}
	url := img.URL
	*field = &url
	return img.Width, img.Height
}
