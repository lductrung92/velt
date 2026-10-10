package settings

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache is a read-through cache for the settings snapshot. The stored snapshot
// keeps secrets ENCRYPTED (the ciphertext bytes from the DB), so nothing
// plaintext-secret is ever placed in the cache.
type Cache interface {
	// Get returns the cached snapshot and true on hit; (nil,false) on miss.
	Get(ctx context.Context) (snapshot, bool)
	// Set stores the snapshot with the cache TTL.
	Set(ctx context.Context, snap snapshot)
	// Invalidate drops the cached snapshot (called AFTER a write commits).
	Invalidate(ctx context.Context)
}

// NoopCache always misses — used when Redis is not configured (reads go to DB).
type NoopCache struct{}

// Get always reports a miss.
func (NoopCache) Get(context.Context) (snapshot, bool) { return nil, false }

// Set is a no-op.
func (NoopCache) Set(context.Context, snapshot) {}

// Invalidate is a no-op.
func (NoopCache) Invalidate(context.Context) {}

const redisCacheKey = "settings:all"

// RedisCache caches the snapshot as one JSON blob in Redis.
type RedisCache struct {
	rdb *redis.Client
	ttl time.Duration
}

// NewRedisCache builds a Redis-backed settings cache.
func NewRedisCache(rdb *redis.Client, ttl time.Duration) *RedisCache {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &RedisCache{rdb: rdb, ttl: ttl}
}

// Get implements Cache. A Redis/decode error is treated as a miss (degrade to DB).
func (c *RedisCache) Get(ctx context.Context) (snapshot, bool) {
	raw, err := c.rdb.Get(ctx, redisCacheKey).Bytes()
	if err != nil {
		return nil, false
	}
	var snap snapshot
	if json.Unmarshal(raw, &snap) != nil {
		return nil, false
	}
	return snap, true
}

// Set implements Cache. Failures are swallowed (cache is best-effort).
func (c *RedisCache) Set(ctx context.Context, snap snapshot) {
	raw, err := json.Marshal(snap)
	if err != nil {
		return
	}
	_ = c.rdb.Set(ctx, redisCacheKey, raw, c.ttl).Err()
}

// Invalidate implements Cache.
func (c *RedisCache) Invalidate(ctx context.Context) {
	_ = c.rdb.Del(ctx, redisCacheKey).Err()
}

// ensure the interface stays satisfied at compile time.
var (
	_ Cache = (*RedisCache)(nil)
	_ Cache = NoopCache{}
)
