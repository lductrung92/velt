// Package media serves stored assets over flat public URLs: /files/{slug}.{ext}
// for the original bytes and /img/{slug}/{w}.{ext} (plus a width-less,
// Accept-negotiating form) for resized, re-encoded images.
//
// It is the READ half only. Uploads — magic-byte sniffing, quotas, permissions —
// stay in the module that owns the asset; that module calls Mint once the bytes
// are stored, and this package never learns what an article or a product is. It
// takes a storage.Storage and a repository over the `files` table, nothing else.
//
// SECURITY MODEL: both routes are UNAUTHENTICATED. What protects an asset is the
// 8 random hex characters in its slug, exactly as the random uuid in the old
// storage key did. Anything that needs an actual authorization check must not be
// minted into this table — it needs a route that checks it.
package media

import (
	"context"
	"errors"
	"strings"
)

// ErrNotFound is returned by a Repository when no row carries the slug.
var ErrNotFound = errors.New("media: not found")

// Record is one row of the `files` table: the public slug and everything needed
// to serve its bytes without touching the owning module.
type Record struct {
	Slug       string
	StorageKey string
	MIME       string
	SizeBytes  int64
	SHA256     string
	// Width and Height are 0 when the asset is not a decodable raster image —
	// which is also what makes it ineligible for /img.
	Width  int
	Height int
}

// IsImage reports whether the asset can be resized and re-encoded. Dimensions
// are recorded at mint time precisely so serving never has to decode to find out.
func (r Record) IsImage() bool { return r.Width > 0 && r.Height > 0 }

// Repository reads the `files` table. The HTTP layer takes this rather than the
// concrete Postgres store so its tests need no database.
type Repository interface {
	BySlug(ctx context.Context, slug string) (Record, error)
}

// Format is a served image encoding. The set is closed: these are the three
// extensions a URL may end in, and the only things the encoder can write.
type Format string

// The served formats. No AVIF: the pure-Go encoder for it is v0.1.0, and
// Lighthouse's "next-gen formats" audit passes on WebP alone (design §5).
const (
	FormatWebP Format = "webp"
	FormatJPEG Format = "jpeg"
	FormatPNG  Format = "png"
)

// ext is the URL extension for a format — "jpg", not "jpeg", because that is
// what the stored keys and the old URLs already use.
func (f Format) ext() string {
	if f == FormatJPEG {
		return "jpg"
	}
	return string(f)
}

// contentType is the response Content-Type for a format.
func (f Format) contentType() string { return "image/" + string(f) }

// formatForExt maps a URL extension to a format. "jpeg" is accepted alongside
// "jpg" so a hand-written URL does not 404 on a spelling.
func formatForExt(ext string) (Format, bool) {
	switch strings.ToLower(ext) {
	case "webp":
		return FormatWebP, true
	case "jpg", "jpeg":
		return FormatJPEG, true
	case "png":
		return FormatPNG, true
	}
	return "", false
}

// formatForMIME maps a stored MIME type to the format its bytes are already in.
// This is the fallback the negotiating URL serves to a client that did not ask
// for WebP, and the default extension a minted URL carries.
func formatForMIME(mime string) (Format, bool) {
	switch mime {
	case "image/webp":
		return FormatWebP, true
	case "image/jpeg":
		return FormatJPEG, true
	case "image/png":
		return FormatPNG, true
	}
	return "", false
}

// mimeForExt is the stored MIME for an upload's extension. Uploads are sniffed
// by magic bytes before they reach storage, so the extension is trustworthy by
// the time a key exists.
func mimeForExt(ext string) string {
	switch strings.ToLower(ext) {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	case "gif":
		return "image/gif"
	case "svg":
		return "image/svg+xml"
	case "pdf":
		return "application/pdf"
	}
	return "application/octet-stream"
}

// URLs builds the public URL for a minted asset. Both bases are configuration,
// never constants: images are meant to live on their own cookie-less subdomain
// (design §2) and either base may become a CDN origin by changing one env var.
// An empty base yields a site-relative URL, which is what local dev wants.
type URLs struct {
	FilesBase string // e.g. https://zukatek.vn
	ImageBase string // e.g. https://img.zukatek.vn
}

// For returns the URL that should be handed back from an upload: the
// Accept-negotiating image URL for an image, the plain file URL otherwise.
// Images get the negotiating form because the console's rich-text editor can
// only write a bare <img src>, never a <picture> (design §2).
func (u URLs) For(r Record) string {
	if f, ok := formatForMIME(r.MIME); ok && r.IsImage() {
		return strings.TrimSuffix(u.ImageBase, "/") + "/img/" + r.Slug + "." + f.ext()
	}
	return strings.TrimSuffix(u.FilesBase, "/") + "/files/" + r.Slug + "." + extOfKey(r.StorageKey)
}

// extOfKey is the storage key's extension without the dot, lowercased.
func extOfKey(key string) string {
	i := strings.LastIndex(key, ".")
	if i < 0 || i == len(key)-1 {
		return "bin"
	}
	return strings.ToLower(key[i+1:])
}
