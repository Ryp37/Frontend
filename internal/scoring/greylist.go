package scoring

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const greylistKeyPrefix = "greylist:"

type GreylistEntry struct {
	CallerID     string `json:"caller_id"`
	TTLRemaining int64  `json:"ttl_remaining_seconds"`
	AddedAt      string `json:"added_at"`
}

type Greylist struct {
	redis *redis.Client
	ttl   time.Duration
}

func NewGreylist(rdb *redis.Client, ttlSec int) *Greylist {
	return &Greylist{redis: rdb, ttl: time.Duration(ttlSec) * time.Second}
}

func (g *Greylist) Add(ctx context.Context, callerID string) error {
	key := greylistKeyPrefix + callerID
	return g.redis.Set(ctx, key, time.Now().UTC().Format(time.RFC3339), g.ttl).Err()
}

func (g *Greylist) Remove(ctx context.Context, callerID string) error {
	key := greylistKeyPrefix + callerID
	deleted, err := g.redis.Del(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("redis del: %w", err)
	}
	if deleted == 0 {
		return fmt.Errorf("caller %q not found in greylist", callerID)
	}
	return nil
}

func (g *Greylist) IsGreylisted(ctx context.Context, callerID string) (bool, error) {
	key := greylistKeyPrefix + callerID
	n, err := g.redis.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("redis exists: %w", err)
	}
	return n > 0, nil
}

func (g *Greylist) List(ctx context.Context) ([]*GreylistEntry, error) {
	var keys []string
	var cursor uint64

	for {
		batch, next, err := g.redis.Scan(ctx, cursor, greylistKeyPrefix+"*", 100).Result()
		if err != nil {
			return nil, fmt.Errorf("redis scan: %w", err)
		}
		keys = append(keys, batch...)
		cursor = next
		if cursor == 0 {
			break
		}
	}

	entries := make([]*GreylistEntry, 0, len(keys))
	for _, key := range keys {
		ttl, err := g.redis.TTL(ctx, key).Result()
		if err != nil || ttl < 0 {
			continue
		}
		addedAt, _ := g.redis.Get(ctx, key).Result()
		callerID := strings.TrimPrefix(key, greylistKeyPrefix)
		entries = append(entries, &GreylistEntry{
			CallerID:     callerID,
			TTLRemaining: int64(ttl.Seconds()),
			AddedAt:      addedAt,
		})
	}
	return entries, nil
}
