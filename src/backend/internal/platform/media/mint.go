package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"image"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/slug"
)

// MintInput describes a file that has just been written to storage and now needs
// a public identity.
type MintInput struct {
	// Key is the storage key the bytes were saved under.
	Key string
	// Base is the readable half of the slug — the upload's purpose ("featured",
	// "avatar", "gallery"), not a filename, because the client does not choose
	// where its bytes land and should not choose what they are called either.
	Base string
	// Data is the stored content, for the hash and the image dimensions. The
	// upload paths already hold it in memory to sniff and size-check it.
	Data      []byte
	OwnerKind string
	OwnerID   *uuid.UUID
}

// Asset is a minted file: its row plus the URL the upload response hands back.
type Asset struct {
	Record
	URL string
}

// Minter records the `files` row for a stored upload. The modules that own
// uploads take this interface, so their tests need no database.
type Minter interface {
	Mint(ctx context.Context, in MintInput) (Asset, error)
}

// MintOr returns the minted URL for a just-stored upload, falling back to the
// legacy /api/files URL when no minter is wired (a test) or the row could not be
// written. The fallback is not a workaround: that route still serves every asset
// and is what every already-published body_html points at, so an upload that
// fails to mint is slower to optimise, never broken.
func MintOr(ctx context.Context, m Minter, in MintInput, fallback string) string {
	if m == nil {
		return fallback
	}
	a, err := m.Mint(ctx, in)
	if err != nil {
		return fallback
	}
	return a.URL
}

// slugRandomBytes is 4 bytes → 8 hex characters, per design §2. It is the whole
// access control on a public asset, so it comes from crypto/rand.
const slugRandomBytes = 4

// mintSlug builds "<readable>-<8 hex>", e.g. "featured-9f3c21aa". The readable
// half is what makes a URL legible in a published page; the random half is what
// makes it unguessable and collision-free without a counter.
func mintSlug(base string) string {
	b := slug.Make(base)
	if b == "" {
		b = "file"
	}
	if len(b) > 48 {
		b = b[:48]
	}
	buf := make([]byte, slugRandomBytes)
	// rand.Read is documented never to fail since Go 1.24.
	_, _ = rand.Read(buf)
	return b + "-" + hex.EncodeToString(buf)
}

// describe derives everything the row stores about the bytes themselves. Width
// and height stay 0 when the content is not a decodable image or declares more
// pixels than the decode guard allows — the same ceiling the serving path uses,
// so an image that could never be rendered never gets an /img URL either.
func describe(in MintInput) Record {
	sum := sha256.Sum256(in.Data)
	rec := Record{
		StorageKey: in.Key,
		MIME:       mimeForExt(extOfKey(in.Key)),
		SizeBytes:  int64(len(in.Data)),
		SHA256:     hex.EncodeToString(sum[:]),
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(in.Data))
	if err == nil && cfg.Width > 0 && cfg.Height > 0 &&
		int64(cfg.Width)*int64(cfg.Height) <= maxDecodePixels {
		rec.Width, rec.Height = cfg.Width, cfg.Height
	}
	return rec
}
