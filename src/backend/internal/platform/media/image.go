package media

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"os"
	"path/filepath"

	webp "github.com/mayahiro/go-webp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // decode-only WebP, so a re-uploaded WebP can be resized
	_ "image/gif"               // DecodeConfig for an uploaded GIF, so its real dimensions are recorded

	"github.com/velt/backend/internal/platform/storage"
)

// AllowedWidths is the closed set of sizes /img will render. This is the DoS
// defence: with no free-form ?w= there is no way to push millions of variants
// into the cache, so the package needs no URL signing to be safe (design §2).
// A width outside the set is a 404, never a clamp — a clamp would serve bytes
// under a URL that promised a different size, and `immutable` would then cache
// that lie for a year.
var AllowedWidths = []int{320, 640, 960, 1280, 1920}

// maxServedWidth is the ceiling the Accept-negotiating /img/{slug}.{ext} URL
// serves at: the largest allowlisted width. That URL names no size, so without
// a cap a 4000px upload pasted into an article body ships 4000px to a phone —
// the one case where the editor cannot write a <picture> and choose for itself.
// It is the last AllowedWidths entry rather than a second constant so the two
// can never drift apart.
var maxServedWidth = AllowedWidths[len(AllowedWidths)-1]

// negotiatedWidth is the width the negotiating URL renders an asset at. A
// source wider than the cap is downscaled to it; anything narrower is served
// whole (width 0), because resizeToWidth never upscales and asking for a width
// the source cannot fill would only split the derivative cache in two under the
// same bytes.
func negotiatedWidth(rec Record) int {
	if rec.Width > maxServedWidth {
		return maxServedWidth
	}
	return 0
}

// maxDecodePixels caps the decoded image, NOT the compressed file. A 60 KB PNG
// can declare 25000×25000 and ask for 2.5 GB of RAM on decode; a file-size limit
// does not see that coming, a pixel-count limit does. 40 MP leaves room for any
// real camera while costing at most ~160 MB of RGBA.
const maxDecodePixels = 40_000_000

// lossyQuality is the WebP/JPEG quality for photographic content. Measured on
// this project's own images: 61,230 B JPEG q80 → 35,522 B WebP q80 (−42%), with
// no visible difference (design decision, §5).
const lossyQuality = 80

// webpSampleTarget is how many pixels the lossy/lossless decision looks at.
// Walking every pixel of a 1920×1080 image to count colours costs more than the
// encode it is deciding about; a grid sample answers the same question.
const webpSampleTarget = 4096

// webpFlatColors is the distinct-colour count below which an image is treated as
// flat artwork rather than a photograph. Measured: a photo samples in the tens of
// thousands of colours, a logo sampled 2.
const webpFlatColors = 256

// ErrTooLarge is returned when a stored image declares more pixels than
// maxDecodePixels, before anything is decoded.
var ErrTooLarge = errors.New("media: image exceeds decode limit")

// ErrUnsupported is returned when the stored bytes are not a decodable image.
var ErrUnsupported = errors.New("media: not a decodable image")

// Images renders and caches the derivatives of stored originals.
type Images struct {
	store storage.Storage
	// cacheRoot holds the rendered derivatives. Separate from the storage driver
	// because it is reconstructible: deleting the whole tree costs CPU, not data,
	// and it must stay local even when originals move to S3.
	cacheRoot string
}

// NewImages builds the image renderer over the storage driver, caching
// derivatives under cacheRoot.
func NewImages(store storage.Storage, cacheRoot string) *Images {
	return &Images{store: store, cacheRoot: cacheRoot}
}

// allowedWidth reports whether w is one of the rendered sizes.
func allowedWidth(w int) bool {
	for _, a := range AllowedWidths {
		if a == w {
			return true
		}
	}
	return false
}

// derivativePath is where the rendered bytes live:
// <cache-root>/<sha[0:2]>/<sha>-<w>.<ext>. Keyed by content hash, so an asset
// that is re-uploaded byte-identical reuses the work, and nothing ever needs
// invalidating — a changed image is a changed hash. Width 0 is the original
// size, which is what the Accept-negotiating URL serves.
func (i *Images) derivativePath(sha string, w int, f Format) string {
	size := "full"
	if w > 0 {
		size = fmt.Sprintf("%d", w)
	}
	return filepath.Join(i.cacheRoot, sha[:2], fmt.Sprintf("%s-%s.%s", sha, size, f.ext()))
}

// Derivative returns the encoded bytes for one (asset, width, format), rendering
// them on first request and reading the cached file afterwards. cached reports
// which of the two happened.
func (i *Images) Derivative(ctx context.Context, rec Record, w int, f Format) (data []byte, cached bool, err error) {
	if w != 0 && !allowedWidth(w) {
		return nil, false, ErrNotFound
	}
	p := i.derivativePath(rec.SHA256, w, f)
	if b, err := os.ReadFile(p); err == nil {
		return b, true, nil
	}
	b, err := i.render(ctx, rec, w, f)
	if err != nil {
		return nil, false, err
	}
	if err := writeFileAtomic(p, b); err != nil {
		// A cache that cannot be written is slow, not broken.
		return b, false, nil
	}
	return b, false, nil
}

// render decodes the original, resizes it and encodes it in the target format.
func (i *Images) render(ctx context.Context, rec Record, w int, f Format) ([]byte, error) {
	rc, err := i.store.Open(ctx, rec.StorageKey)
	if err != nil {
		return nil, ErrNotFound
	}
	defer func() { _ = rc.Close() }()
	src, err := io.ReadAll(rc)
	if err != nil {
		return nil, fmt.Errorf("read original: %w", err)
	}
	img, err := decodeGuarded(src)
	if err != nil {
		return nil, err
	}
	img = resizeToWidth(img, w)
	return encode(img, f)
}

// decodeGuarded reads the header first and refuses the image on its declared
// pixel count, so a decompression bomb is rejected before any pixel buffer is
// allocated.
func decodeGuarded(src []byte) (image.Image, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(src))
	if err != nil {
		return nil, ErrUnsupported
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > maxDecodePixels {
		return nil, ErrTooLarge
	}
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return nil, ErrUnsupported
	}
	return img, nil
}

// resizeToWidth scales the image to w pixels wide, preserving aspect ratio.
// It never upscales: a 400px original asked for at 1920 is served at 400, because
// inventing pixels costs bytes and adds nothing a browser cannot do itself.
func resizeToWidth(img image.Image, w int) image.Image {
	b := img.Bounds()
	if w <= 0 || w >= b.Dx() || b.Dx() == 0 {
		return img
	}
	h := int(math.Round(float64(b.Dy()) * float64(w) / float64(b.Dx())))
	if h < 1 {
		h = 1
	}
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Src, nil)
	return dst
}

// encode writes the image in the requested format.
func encode(img image.Image, f Format) ([]byte, error) {
	var buf bytes.Buffer
	var err error
	switch f {
	case FormatWebP:
		err = webp.Encode(&buf, img, webpOptions(img))
	case FormatJPEG:
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: lossyQuality})
	case FormatPNG:
		err = png.Encode(&buf, img)
	default:
		return nil, ErrUnsupported
	}
	if err != nil {
		return nil, fmt.Errorf("encode %s: %w", f, err)
	}
	return buf.Bytes(), nil
}

// webpOptions chooses lossless vs lossy per image rather than once for the
// project, because the right answer is not the same for both kinds of asset.
// Measured on this project's images at 960px: a photograph shrank 42% under
// lossy q80, while a flat two-colour logo grew from 3,759 B to 6,832 B — lossy
// VP8 spends bits inventing texture where there is none. Transparency forces
// lossless too, since VP8 lossy has no alpha of its own here.
func webpOptions(img image.Image) *webp.Options {
	hasAlpha, distinct := sampleColors(img)
	if hasAlpha || distinct <= webpFlatColors {
		return &webp.Options{Compression: webp.CompressionLossless}
	}
	return &webp.Options{Compression: webp.CompressionLossy, Quality: lossyQuality}
}

// sampleColors walks a grid of about webpSampleTarget pixels and reports whether
// any of them is transparent and how many distinct colours they span (counted no
// further than it takes to decide, see webpFlatColors).
func sampleColors(img image.Image) (hasAlpha bool, distinct int) {
	b := img.Bounds()
	area := b.Dx() * b.Dy()
	if area == 0 {
		return false, 0
	}
	step := int(math.Sqrt(float64(area) / float64(webpSampleTarget)))
	if step < 1 {
		step = 1
	}
	seen := make(map[uint64]struct{}, webpSampleTarget)
	for y := b.Min.Y; y < b.Max.Y; y += step {
		for x := b.Min.X; x < b.Max.X; x += step {
			r, g, bl, a := img.At(x, y).RGBA()
			if a < 0xffff {
				hasAlpha = true
			}
			seen[uint64(r)<<48|uint64(g)<<32|uint64(bl)<<16|uint64(a)] = struct{}{}
		}
	}
	return hasAlpha, len(seen)
}

// writeFileAtomic writes through a temp file in the same directory and renames,
// so a reader never sees a half-written derivative and two concurrent renders of
// the same variant cannot interleave.
func writeFileAtomic(p string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), filepath.Base(p)+".*")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), p); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	return nil
}
