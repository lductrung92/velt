package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisLimiter is a fixed-window limiter backed by Redis, correct across
// multiple instances. Key shape: "rl:<key>".
type RedisLimiter struct {
	rdb *redis.Client
}

// NewRedisLimiter wraps a redis client.
func NewRedisLimiter(rdb *redis.Client) *RedisLimiter { return &RedisLimiter{rdb: rdb} }

// incrExpire atomically increments the bucket and sets the window TTL on the
// first hit, returning the new count. Doing both in one script avoids the
// crash-between-INCR-and-EXPIRE window that could leave a key with no TTL
// (permanently stuck at/over the limit).
var incrExpire = redis.NewScript(`
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c
`)

// Allow implements Limiter.
func (l *RedisLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, int, error) {
	rkey := "rl:" + key
	cnt, err := incrExpire.Run(ctx, l.rdb, []string{rkey}, window.Milliseconds()).Int64()
	if err != nil {
		return false, 0, fmt.Errorf("redis incr: %w", err)
	}
	if cnt > int64(limit) {
		ttl, err := l.rdb.TTL(ctx, rkey).Result()
		if err != nil || ttl <= 0 {
			ttl = window
		}
		return false, secondsUntil(time.Now().Add(ttl), time.Now()), nil
	}
	return true, 0, nil
}
