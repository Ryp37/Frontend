package scoring

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
)

const whitelistKey = "whitelist"

type WhitelistEntry struct {
	Prefix string `json:"prefix"`
	Label  string `json:"label"`
	Tier   string `json:"tier"`
}

type Whitelist struct {
	redis *redis.Client
}

func NewWhitelist(rdb *redis.Client) *Whitelist {
	return &Whitelist{redis: rdb}
}

var validTiers = map[string]bool{
	"GREEN":  true,
	"YELLOW": true,
	"RED":    true,
	"TELCO":  true,
	"CLOUD":  true,
}

func (w *Whitelist) Add(ctx context.Context, entry *WhitelistEntry) error {
	if entry.Prefix == "" {
		return fmt.Errorf("prefix cannot be empty")
	}
	if !validTiers[entry.Tier] {
		return fmt.Errorf("tier must be GREEN, YELLOW, RED, TELCO, or CLOUD")
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("marshal whitelist entry: %w", err)
	}

	return w.redis.HSet(ctx, whitelistKey, entry.Prefix, string(data)).Err()
}

func (w *Whitelist) Remove(ctx context.Context, prefix string) error {
	deleted, err := w.redis.HDel(ctx, whitelistKey, prefix).Result()
	if err != nil {
		return fmt.Errorf("redis hdel: %w", err)
	}
	if deleted == 0 {
		return fmt.Errorf("prefix %q not found in whitelist", prefix)
	}
	return nil
}

func (w *Whitelist) List(ctx context.Context) ([]*WhitelistEntry, error) {
	all, err := w.redis.HGetAll(ctx, whitelistKey).Result()
	if err != nil {
		return nil, fmt.Errorf("redis hgetall: %w", err)
	}

	entries := make([]*WhitelistEntry, 0, len(all))
	for _, raw := range all {
		var entry WhitelistEntry
		if err := json.Unmarshal([]byte(raw), &entry); err != nil {
			continue
		}
		entries = append(entries, &entry)
	}
	return entries, nil
}

func (w *Whitelist) Match(ctx context.Context, callerID string) (*WhitelistEntry, error) {
	all, err := w.redis.HGetAll(ctx, whitelistKey).Result()
	if err != nil {
		return nil, fmt.Errorf("redis hgetall: %w", err)
	}

	var bestMatch *WhitelistEntry
	for prefix, raw := range all {
		if strings.HasPrefix(callerID, prefix) {
			if bestMatch == nil || len(prefix) > len(bestMatch.Prefix) {
				var entry WhitelistEntry
				if err := json.Unmarshal([]byte(raw), &entry); err != nil {
					continue
				}
				bestMatch = &entry
			}
		}
	}
	return bestMatch, nil
}
