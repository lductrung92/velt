package media

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// The DELETE side: what has to disappear when an owning module deletes stored
// bytes.
//
// Three things exist per asset, and until now only the first was ever removed:
// the object in the storage driver, the `files` row that gives it a public
// identity, and the rendered derivatives under the cache root. A row left
// behind keeps a slug resolving to a storage key with nothing behind it; a
// derivative left behind is a copy of a deleted image that /img will happily
// keep serving, because the cache is keyed by content hash and the hash of a
// deleted file never changes.
//
// The call belongs to the owning module's delete path — that module knows what
// it is deleting and why — so this package only offers the capability and never
// reaches back into one.

// Forgetter drops an asset's public identity when its bytes are deleted.
type Forgetter interface {
	// Forget removes the `files` row for one storage key and every derivative
	// rendered from its bytes.
	Forget(ctx context.Context, key string) error
	// ForgetPrefix does the same for every key under a prefix — what a whole
	// media folder being reclaimed looks like (an article, a product, a landing
	// page being deleted).
	ForgetPrefix(ctx context.Context, prefix string) error
}

// Keeper is the whole surface the owning modules use: mint a public identity
// when bytes are stored, forget it when they are deleted, and read back the
// identities of keys they already hold — which is how a garbage collector
// learns what a stored object is called in public without parsing anything.
type Keeper interface {
	Minter
	Forgetter
	BulkRepository
}

// rowDeleter is the half of the Store this needs. Taking the interface rather
// than *Store keeps the cache-clearing testable without a database.
type rowDeleter interface {
	deleteByKey(ctx context.Context, key string) ([]string, error)
	deleteByPrefix(ctx context.Context, prefix string) ([]string, error)
}

// Keep is the concrete Keeper: the `files` rows plus the derivative cache those
// rows key.
type Keep struct {
	*Store
	rows      rowDeleter
	cacheRoot string
}

// NewKeep wires minting and forgetting over one store and one cache root.
func NewKeep(s *Store, cacheRoot string) *Keep {
	return &Keep{Store: s, rows: s, cacheRoot: cacheRoot}
}

// Forget implements Forgetter.
func (k *Keep) Forget(ctx context.Context, key string) error {
	shas, err := k.rows.deleteByKey(ctx, key)
	if err != nil {
		return err
	}
	k.dropDerivatives(shas)
	return nil
}

// ForgetPrefix implements Forgetter.
func (k *Keep) ForgetPrefix(ctx context.Context, prefix string) error {
	shas, err := k.rows.deleteByPrefix(ctx, prefix)
	if err != nil {
		return err
	}
	k.dropDerivatives(shas)
	return nil
}

// dropDerivatives removes every rendered size and format of each hash — the
// whole <cache-root>/<sha[0:2]>/<sha>-* branch (design §4).
//
// Two different assets with identical bytes share a hash and therefore a
// branch, so deleting one can drop the other's cached renderings. That is
// harmless by construction: the surviving original is still in storage, and the
// next request renders it again. A cache is the one thing that may be wrong
// only by being slow.
func (k *Keep) dropDerivatives(shas []string) {
	for _, sha := range shas {
		if len(sha) < 2 {
			continue
		}
		matches, err := filepath.Glob(filepath.Join(k.cacheRoot, sha[:2], sha+"-*"))
		if err != nil {
			continue
		}
		for _, p := range matches {
			_ = os.Remove(p)
		}
	}
}

// Forget removes an asset's public identity, best-effort and nil-safe. It is
// the one-liner the module delete paths call: a module with no media wiring —
// a test, or a deployment before the `files` table existed — simply deletes the
// bytes as it always did.
func Forget(ctx context.Context, f Forgetter, key string) {
	if f == nil || key == "" {
		return
	}
	_ = f.Forget(ctx, key)
}

// ForgetPrefix is Forget for a whole media folder.
func ForgetPrefix(ctx context.Context, f Forgetter, prefix string) {
	if f == nil || prefix == "" {
		return
	}
	_ = f.ForgetPrefix(ctx, prefix)
}

// deleteByKey removes one row and reports the content hash it had, so the
// caller can drop the derivatives rendered from those bytes.
func (s *Store) deleteByKey(ctx context.Context, key string) ([]string, error) {
	return s.deleteReturningSHA(ctx,
		`DELETE FROM files WHERE storage_key = $1 RETURNING sha256`, key)
}

// deleteByPrefix removes every row under a storage prefix. The prefix is
// matched literally: it is built by the module from an entity id, never from
// anything a client sends, but escaping it anyway means a key containing % or _
// cannot widen the delete.
func (s *Store) deleteByPrefix(ctx context.Context, prefix string) ([]string, error) {
	return s.deleteReturningSHA(ctx,
		`DELETE FROM files WHERE storage_key LIKE $1 ESCAPE '\' RETURNING sha256`,
		escapeLike(prefix)+"%")
}

func (s *Store) deleteReturningSHA(ctx context.Context, query, arg string) ([]string, error) {
	rows, err := s.pool.Query(ctx, query, arg)
	if err != nil {
		return nil, fmt.Errorf("delete files row: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var sha string
		if err := rows.Scan(&sha); err != nil {
			return nil, fmt.Errorf("scan deleted sha: %w", err)
		}
		out = append(out, sha)
	}
	return out, rows.Err()
}

// escapeLike neutralises the LIKE metacharacters in a literal prefix.
func escapeLike(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r == '%' || r == '_' || r == '\\' {
			out = append(out, '\\')
		}
		out = append(out, r)
	}
	return string(out)
}

var (
	_ Keeper    = (*Keep)(nil)
	_ Forgetter = (*Keep)(nil)
)
