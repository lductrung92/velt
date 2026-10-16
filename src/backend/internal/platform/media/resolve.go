package media

import (
	"context"
	"sync"
)

// resolveCacheMax bounds the in-process slug cache. Every served byte starts
// with one of these lookups, so the table would otherwise be read once per
// image per request.
const resolveCacheMax = 2048

// Resolver turns a slug into its `files` row, remembering what it has seen.
//
// The cache has no expiry and no refresh, because a row here is immutable by
// construction: replacing an asset mints a NEW slug (that is also why the URLs
// may be `immutable`), and a deleted slug is a 404 either way — serving a few
// more bytes from a row that has just been deleted is the same outcome as the
// CDN copy that outlives it. So the only failure mode worth guarding is
// unbounded growth, and the whole map is dropped at the cap rather than carrying
// an eviction policy nobody would tune.
type Resolver struct {
	repo Repository

	mu    sync.RWMutex
	cache map[string]Record
}

// NewResolver builds a resolver over the `files` repository.
func NewResolver(repo Repository) *Resolver {
	return &Resolver{repo: repo, cache: make(map[string]Record)}
}

// Resolve returns the record for a slug, or ErrNotFound.
func (r *Resolver) Resolve(ctx context.Context, slug string) (Record, error) {
	r.mu.RLock()
	rec, ok := r.cache[slug]
	r.mu.RUnlock()
	if ok {
		return rec, nil
	}
	rec, err := r.repo.BySlug(ctx, slug)
	if err != nil {
		return Record{}, err
	}
	r.mu.Lock()
	if len(r.cache) >= resolveCacheMax {
		r.cache = make(map[string]Record)
	}
	r.cache[slug] = rec
	r.mu.Unlock()
	return rec, nil
}
