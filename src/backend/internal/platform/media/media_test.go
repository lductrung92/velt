package media

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"io"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	webp "github.com/mayahiro/go-webp"
)

// --- fakes -------------------------------------------------------------------

// fakeStore is a storage.Storage over a map, so these tests need no disk.
type fakeStore map[string][]byte

func (f fakeStore) Save(_ context.Context, key string, r io.Reader) error {
	b, err := io.ReadAll(r)
	f[key] = b
	return err
}

func (f fakeStore) Open(_ context.Context, p string) (io.ReadCloser, error) {
	b, ok := f[p]
	if !ok {
		return nil, ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

func (f fakeStore) Delete(_ context.Context, p string) error { delete(f, p); return nil }
func (f fakeStore) URL(_ context.Context, key string) string { return "/api/files/" + key }

// fakeRepo is a Repository over a map.
type fakeRepo map[string]Record

func (f fakeRepo) BySlug(_ context.Context, slug string) (Record, error) {
	r, ok := f[slug]
	if !ok {
		return Record{}, ErrNotFound
	}
	return r, nil
}

// --- fixtures ----------------------------------------------------------------

// photoPNG is a noisy opaque image: many distinct colours, no transparency —
// the shape of a photograph as far as the encoder's decision is concerned.
func photoPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 128, 96))
	rnd := rand.New(rand.NewPCG(1, 2))
	for y := range 96 {
		for x := range 128 {
			img.Set(x, y, color.NRGBA{
				R: uint8(rnd.UintN(256)), G: uint8(rnd.UintN(256)), B: uint8(rnd.UintN(256)), A: 255,
			})
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

// logoImage is flat two-colour artwork with a transparent background — the case
// that measured LARGER under lossy WebP than it started.
func logoImage() image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	for y := range 64 {
		for x := range 64 {
			c := color.NRGBA{}
			if x > 16 && x < 48 && y > 16 && y < 48 {
				c = color.NRGBA{R: 0x10, G: 0x30, B: 0x80, A: 255}
			}
			img.Set(x, y, c)
		}
	}
	return img
}

// bombPNG is a PNG header that DECLARES w×h pixels with no pixel data behind it
// — 69 bytes claiming to be gigabytes. A size limit waves it through; this is
// what the pixel-count guard exists for.
func bombPNG(w, h uint32) []byte {
	var out bytes.Buffer
	out.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	data := make([]byte, 0, 13)
	data = binary.BigEndian.AppendUint32(data, w)
	data = binary.BigEndian.AppendUint32(data, h)
	data = append(data, 8, 2, 0, 0, 0) // 8-bit truecolour, no interlace
	chunk := append([]byte("IHDR"), data...)
	_ = binary.Write(&out, binary.BigEndian, uint32(len(data)))
	out.Write(chunk)
	_ = binary.Write(&out, binary.BigEndian, crc32.ChecksumIEEE(chunk))
	return out.Bytes()
}

// serveTest builds a router over one stored photo, returning it and the slug.
func serveTest(t *testing.T) (http.Handler, Record) {
	t.Helper()
	data := photoPNG(t)
	rec := describe(MintInput{Key: "cms/articles/x/featured-1.png", Data: data})
	rec.Slug = "featured-9f3c21aa"
	store := fakeStore{rec.StorageKey: data}
	h := NewHandler(fakeRepo{rec.Slug: rec}, store, t.TempDir())
	r := chi.NewRouter()
	RegisterRoutes(r, h)
	return r, rec
}

func get(t *testing.T, h http.Handler, path string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// --- tests -------------------------------------------------------------------

func TestServeFileResolvesSlug(t *testing.T) {
	h, rec := serveTest(t)

	res := get(t, h, "/files/"+rec.Slug+".png", nil)
	require.Equal(t, http.StatusOK, res.Code)
	require.Equal(t, "image/png", res.Header().Get("Content-Type"))
	require.Equal(t, int(rec.SizeBytes), res.Body.Len())
	require.Equal(t, "nosniff", res.Header().Get("X-Content-Type-Options"))
	require.Equal(t, "default-src 'none'; sandbox", res.Header().Get("Content-Security-Policy"))
}

func TestServeFileUnknownSlugIs404(t *testing.T) {
	h, _ := serveTest(t)

	require.Equal(t, http.StatusNotFound, get(t, h, "/files/no-such-slug.png", nil).Code)
	require.Equal(t, http.StatusNotFound, get(t, h, "/img/no-such-slug/640.webp", nil).Code)
	require.Equal(t, http.StatusNotFound, get(t, h, "/img/no-such-slug.webp", nil).Code)
}

func TestServeFileExtensionMustMatch(t *testing.T) {
	h, rec := serveTest(t)

	// The stored asset is a .png; a .jpg URL for it is a different asset, not a
	// second name for this one.
	require.Equal(t, http.StatusNotFound, get(t, h, "/files/"+rec.Slug+".jpg", nil).Code)
}

func TestWidthOutsideAllowlistIsRejectedNotClamped(t *testing.T) {
	h, rec := serveTest(t)

	for _, w := range []string{"321", "1000", "1921", "0", "-320", "64"} {
		res := get(t, h, "/img/"+rec.Slug+"/"+w+".webp", nil)
		require.Equal(t, http.StatusNotFound, res.Code, "width %s must 404", w)
		require.NotContains(t, res.Header().Get("Content-Type"), "image/",
			"width %s must not be served at a clamped size", w)
	}
	// The allowlisted neighbours of those values do serve, so the 404s above are
	// the allowlist talking and not a broken route.
	for _, w := range AllowedWidths {
		res := get(t, h, "/img/"+rec.Slug+"/"+strconv.Itoa(w)+".webp", nil)
		require.Equal(t, http.StatusOK, res.Code, "width %d must serve", w)
	}
}

func TestNegotiatePicksWebPOverFallback(t *testing.T) {
	require.Equal(t, FormatWebP, Negotiate("image/avif,image/webp,*/*;q=0.8", FormatJPEG))
	require.Equal(t, FormatJPEG, Negotiate("image/avif,*/*;q=0.8", FormatJPEG))
	require.Equal(t, FormatPNG, Negotiate("", FormatPNG))
	// A wildcard is what curl and old clients send; it is not a claim to read WebP.
	require.Equal(t, FormatJPEG, Negotiate("*/*", FormatJPEG))
	// An explicit refusal is honoured.
	require.Equal(t, FormatJPEG, Negotiate("image/webp;q=0,image/jpeg", FormatJPEG))
}

func TestNegotiatingURLServesWebPOrFallback(t *testing.T) {
	h, rec := serveTest(t)

	webpRes := get(t, h, "/img/"+rec.Slug+".jpg", map[string]string{"Accept": "image/webp,image/*,*/*;q=0.8"})
	require.Equal(t, http.StatusOK, webpRes.Code)
	require.Equal(t, "image/webp", webpRes.Header().Get("Content-Type"))

	jpegRes := get(t, h, "/img/"+rec.Slug+".jpg", map[string]string{"Accept": "image/jpeg,*/*;q=0.8"})
	require.Equal(t, http.StatusOK, jpegRes.Code)
	require.Equal(t, "image/jpeg", jpegRes.Header().Get("Content-Type"))

	// Same URL, different bytes — which is exactly why it carries Vary and must
	// not carry immutable.
	require.NotEqual(t, webpRes.Body.Bytes(), jpegRes.Body.Bytes())
}

func TestHeadIsAnsweredLikeGet(t *testing.T) {
	// chi does not fold HEAD into a GET route, so an uptime check or a CDN
	// revalidating by HEAD used to get 405 for a file that is plainly there.
	h, rec := serveTest(t)

	for _, path := range []string{
		"/files/" + rec.Slug + ".png",
		"/img/" + rec.Slug + ".webp",
		"/img/" + rec.Slug + "/640.webp",
	} {
		req := httptest.NewRequest(http.MethodHead, path, nil)
		req.Header.Set("Accept", "image/webp")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code, path)
		require.NotEmpty(t, w.Header().Get("ETag"), path)
	}
}

func TestCacheHeadersDifferByURLShape(t *testing.T) {
	h, rec := serveTest(t)

	sized := get(t, h, "/img/"+rec.Slug+"/640.webp", nil)
	require.Equal(t, http.StatusOK, sized.Code)
	require.Contains(t, sized.Header().Get("Cache-Control"), "immutable")
	require.Empty(t, sized.Header().Get("Vary"), "a URL that names the exact rendering does not vary")

	negotiated := get(t, h, "/img/"+rec.Slug+".webp", nil)
	require.Equal(t, http.StatusOK, negotiated.Code)
	require.NotContains(t, negotiated.Header().Get("Cache-Control"), "immutable",
		"the negotiating URL returns different bytes to different clients")
	require.Equal(t, "Accept", negotiated.Header().Get("Vary"))

	file := get(t, h, "/files/"+rec.Slug+".png", nil)
	require.Contains(t, file.Header().Get("Cache-Control"), "immutable")
	require.Empty(t, file.Header().Get("Vary"))
}

func TestETagRoundTripReturns304(t *testing.T) {
	h, rec := serveTest(t)

	for _, path := range []string{
		"/files/" + rec.Slug + ".png",
		"/img/" + rec.Slug + "/640.webp",
		"/img/" + rec.Slug + ".webp",
	} {
		first := get(t, h, path, nil)
		require.Equal(t, http.StatusOK, first.Code, path)
		etag := first.Header().Get("ETag")
		require.NotEmpty(t, etag, path)

		second := get(t, h, path, map[string]string{"If-None-Match": etag})
		require.Equal(t, http.StatusNotModified, second.Code, path)
		require.Zero(t, second.Body.Len(), path)
		require.Equal(t, etag, second.Header().Get("ETag"), path)

		// A stale validator must not short-circuit.
		stale := get(t, h, path, map[string]string{"If-None-Match": `"something-else"`})
		require.Equal(t, http.StatusOK, stale.Code, path)
	}
}

func TestETagDiffersPerRendering(t *testing.T) {
	h, rec := serveTest(t)

	w640 := get(t, h, "/img/"+rec.Slug+"/640.webp", nil).Header().Get("ETag")
	w320 := get(t, h, "/img/"+rec.Slug+"/320.webp", nil).Header().Get("ETag")
	jpg := get(t, h, "/img/"+rec.Slug+"/640.jpg", nil).Header().Get("ETag")
	require.NotEqual(t, w640, w320)
	require.NotEqual(t, w640, jpg)
}

func TestDerivativeCacheServesSecondRequestFromDisk(t *testing.T) {
	h, rec := serveTest(t)

	first := get(t, h, "/img/"+rec.Slug+"/320.webp", nil)
	require.Equal(t, "miss", first.Header().Get("X-Media-Cache"))
	second := get(t, h, "/img/"+rec.Slug+"/320.webp", nil)
	require.Equal(t, "hit", second.Header().Get("X-Media-Cache"))
	require.Equal(t, first.Body.Bytes(), second.Body.Bytes())
}

func TestDecodeBombIsRejectedOnPixelCount(t *testing.T) {
	// 25,000 × 25,000 = 625 MP in 33 bytes of header.
	_, err := decodeGuarded(bombPNG(25000, 25000))
	require.ErrorIs(t, err, ErrTooLarge)

	// The guard is on pixels, not bytes: a tall-and-thin bomb is caught too.
	_, err = decodeGuarded(bombPNG(100, 1_000_000))
	require.ErrorIs(t, err, ErrTooLarge)

	// And an ordinary image still decodes.
	img, err := decodeGuarded(photoPNG(t))
	require.NoError(t, err)
	require.Equal(t, 128, img.Bounds().Dx())
}

func TestDecodeBombIs404AtTheRoute(t *testing.T) {
	data := bombPNG(25000, 25000)
	rec := Record{
		Slug: "bomb-00000000", StorageKey: "cms/articles/x/inline-1.png", MIME: "image/png",
		SizeBytes: int64(len(data)), SHA256: "ab" + "cd0123456789", Width: 25000, Height: 25000,
	}
	r := chi.NewRouter()
	RegisterRoutes(r, NewHandler(fakeRepo{rec.Slug: rec}, fakeStore{rec.StorageKey: data}, t.TempDir()))

	require.Equal(t, http.StatusNotFound, get(t, r, "/img/"+rec.Slug+"/640.webp", nil).Code)
}

func TestMintSkipsDimensionsForABomb(t *testing.T) {
	// A row with no dimensions is a row /img refuses, so the guard holds even if
	// a bomb somehow gets past upload sniffing.
	rec := describe(MintInput{Key: "cms/articles/x/inline-1.png", Data: bombPNG(25000, 25000)})
	require.Zero(t, rec.Width)
	require.False(t, rec.IsImage())
}

func TestWebPModeFollowsTheImage(t *testing.T) {
	photo, err := decodeGuarded(photoPNG(t))
	require.NoError(t, err)
	require.Equal(t, webp.CompressionLossy, webpOptions(photo).Compression,
		"a photograph compresses well lossy and shows no artefacts at q80")
	require.Equal(t, lossyQuality, webpOptions(photo).Quality)

	require.Equal(t, webp.CompressionLossless, webpOptions(logoImage()).Compression,
		"flat artwork with transparency grows under lossy VP8")

	// Both halves of the rule stand on their own: flat artwork with no
	// transparency is still lossless.
	opaqueLogo := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	for y := range 64 {
		for x := range 64 {
			c := color.NRGBA{R: 255, G: 255, B: 255, A: 255}
			if x > 16 && x < 48 {
				c = color.NRGBA{R: 0x10, G: 0x30, B: 0x80, A: 255}
			}
			opaqueLogo.Set(x, y, c)
		}
	}
	hasAlpha, distinct := sampleColors(opaqueLogo)
	require.False(t, hasAlpha)
	require.Equal(t, 2, distinct)
	require.Equal(t, webp.CompressionLossless, webpOptions(opaqueLogo).Compression)
}

func TestResizeNeverUpscales(t *testing.T) {
	img, err := decodeGuarded(photoPNG(t)) // 128×96
	require.NoError(t, err)
	require.Equal(t, 128, resizeToWidth(img, 1920).Bounds().Dx())
	require.Equal(t, 64, resizeToWidth(img, 64).Bounds().Dx())
	require.Equal(t, 48, resizeToWidth(img, 64).Bounds().Dy(), "aspect ratio is preserved")
}

// widePhotoPNG is a noisy opaque image w pixels wide — the shape of a photo
// straight off a camera, which is wider than anything a page ever renders.
func widePhotoPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	rnd := rand.New(rand.NewPCG(3, 4))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.NRGBA{
				R: uint8(rnd.UintN(256)), G: uint8(rnd.UintN(256)), B: uint8(rnd.UintN(256)), A: 255,
			})
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

// servePhoto builds a router over one stored image of the given size.
func servePhoto(t *testing.T, data []byte) (http.Handler, Record) {
	t.Helper()
	rec := describe(MintInput{Key: "cms/articles/x/featured-1.png", Data: data})
	rec.Slug = "featured-9f3c21aa"
	h := NewHandler(fakeRepo{rec.Slug: rec}, fakeStore{rec.StorageKey: data}, t.TempDir())
	r := chi.NewRouter()
	RegisterRoutes(r, h)
	return r, rec
}

// decodedWidth is the pixel width of an image response, read back from the
// bytes rather than from a header — the point of the cap is the actual pixels.
func decodedWidth(t *testing.T, body []byte) int {
	t.Helper()
	cfg, _, err := image.DecodeConfig(bytes.NewReader(body))
	require.NoError(t, err)
	return cfg.Width
}

func TestNegotiatingURLCapsAtTheLargestWidth(t *testing.T) {
	// 2400px wide: wider than any rendered size, and the /img/{slug}.{ext} URL
	// names no width, so the cap is the only thing between the source and a
	// phone.
	h, rec := servePhoto(t, widePhotoPNG(t, 2400, 300))
	require.Equal(t, 2400, rec.Width, "the row records the real source size")

	res := get(t, h, "/img/"+rec.Slug+".webp", map[string]string{"Accept": "image/webp"})
	require.Equal(t, http.StatusOK, res.Code)
	require.Equal(t, 1920, decodedWidth(t, res.Body.Bytes()))
	// Downscaling is all it does: the headers are the negotiating URL's, still
	// without immutable, and still varying on Accept.
	require.Equal(t, cacheNegotiated, res.Header().Get("Cache-Control"))
	require.Equal(t, "Accept", res.Header().Get("Vary"))

	// The cap names a rendering, so it names the ETag too: the bytes this URL
	// answers with changed, and a cache holding the uncapped tag must miss.
	require.Equal(t, `"`+rec.SHA256+`-1920-webp"`, res.Header().Get("ETag"))
	require.NotEqual(t, `"`+rec.SHA256+`-0-webp"`, res.Header().Get("ETag"))
}

func TestNegotiatingURLLeavesASmallerSourceAlone(t *testing.T) {
	// Never upscale: a 128px source asked for without a width stays 128px, and
	// keeps the width-0 ETag, so the cap costs an already-small image nothing.
	h, rec := servePhoto(t, photoPNG(t))

	res := get(t, h, "/img/"+rec.Slug+".webp", map[string]string{"Accept": "image/webp"})
	require.Equal(t, http.StatusOK, res.Code)
	require.Equal(t, 128, decodedWidth(t, res.Body.Bytes()))
	require.Equal(t, `"`+rec.SHA256+`-0-webp"`, res.Header().Get("ETag"))
}

func TestMintedURLsUseTheConfiguredBases(t *testing.T) {
	u := URLs{FilesBase: "https://zukatek.vn", ImageBase: "https://img.zukatek.vn"}

	img := Record{Slug: "featured-9f3c21aa", StorageKey: "cms/a/b/featured-1.png", MIME: "image/png", Width: 10, Height: 10}
	require.Equal(t, "https://img.zukatek.vn/img/featured-9f3c21aa.png", u.For(img))

	doc := Record{Slug: "report-12345678", StorageKey: "cms/a/b/report-1.pdf", MIME: "application/pdf"}
	require.Equal(t, "https://zukatek.vn/files/report-12345678.pdf", u.For(doc))

	// Unset bases are site-relative, which is what single-origin local dev wants.
	require.Equal(t, "/img/featured-9f3c21aa.png", URLs{}.For(img))
}

func TestMintSlugShape(t *testing.T) {
	s := mintSlug("Sơ đồ kiến trúc")
	require.Regexp(t, `^so-do-kien-truc-[0-9a-f]{8}$`, s)
	require.Regexp(t, `^file-[0-9a-f]{8}$`, mintSlug("!!!"))
	require.NotEqual(t, mintSlug("featured"), mintSlug("featured"), "the random half is random")
}

func TestResolverCachesAndStillReports404(t *testing.T) {
	rec := Record{Slug: "a-00000000", StorageKey: "users/u/avatar-1.png"}
	repo := countingRepo{inner: fakeRepo{rec.Slug: rec}}
	r := NewResolver(&repo)

	for range 3 {
		got, err := r.Resolve(context.Background(), rec.Slug)
		require.NoError(t, err)
		require.Equal(t, rec.StorageKey, got.StorageKey)
	}
	require.Equal(t, 1, repo.calls, "a resolved slug is read from the table once")

	_, err := r.Resolve(context.Background(), "missing-00000000")
	require.ErrorIs(t, err, ErrNotFound)
}

type countingRepo struct {
	inner fakeRepo
	calls int
}

func (c *countingRepo) BySlug(ctx context.Context, slug string) (Record, error) {
	c.calls++
	return c.inner.BySlug(ctx, slug)
}
