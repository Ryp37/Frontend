package scoring

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"sipguard/internal/config"
)

type Status string

const (
	StatusGreen  Status = "GREEN"
	StatusYellow Status = "YELLOW"
	StatusRed    Status = "RED"
)

type ScoreResult struct {
	Status    Status    `json:"status"`
	Score     int64     `json:"score"`
	Reason    string    `json:"reason"`
	Timestamp time.Time `json:"timestamp"`
	Blocked   bool      `json:"blocked"`
}

type Engine struct {
	redis     *redis.Client
	cfg       *config.Config
	whitelist *Whitelist
	greylist  *Greylist
}

func NewEngine(rdb *redis.Client, cfg *config.Config) *Engine {
	return &Engine{
		redis:     rdb,
		cfg:       cfg,
		whitelist: NewWhitelist(rdb),
		greylist:  NewGreylist(rdb, cfg.GreylistTTLSec),
	}
}

func (e *Engine) Check(ctx context.Context, callerID, destination string) (*ScoreResult, error) {
	entry, err := e.whitelist.Match(ctx, callerID)
	if err != nil {
		return nil, fmt.Errorf("whitelist lookup: %w", err)
	}
	if entry != nil {
		status := tierToStatus(entry.Tier)
		blocked := status == StatusRed && !e.cfg.AuditMode
		result := &ScoreResult{
			Status:    status,
			Score:     0,
			Reason:    fmt.Sprintf("caller %s matched whitelist prefix %s (%s → %s)", callerID, entry.Prefix, entry.Tier, status),
			Timestamp: time.Now().UTC(),
			Blocked:   blocked,
		}
		e.incrementStats(ctx, result.Status)
		return result, nil
	}

	key := fmt.Sprintf("score:%s", callerID)
	score, err := e.redis.Incr(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("redis incr: %w", err)
	}

	if score == 1 {
		e.redis.Expire(ctx, key, 24*time.Hour)
	}

	result := e.classify(score, callerID)

	if result.Status == StatusYellow {
		_ = e.greylist.Add(ctx, callerID)
	}

	e.incrementStats(ctx, result.Status)
	return result, nil
}

func (e *Engine) classify(score int64, callerID string) *ScoreResult {
	result := &ScoreResult{
		Score:     score,
		Timestamp: time.Now().UTC(),
	}

	switch {
	case score < int64(e.cfg.GreenThreshold):
		result.Status = StatusGreen
		result.Reason = fmt.Sprintf("caller %s has low call frequency (score: %d)", callerID, score)
		result.Blocked = false

	case score <= int64(e.cfg.RedThreshold):
		result.Status = StatusYellow
		result.Reason = fmt.Sprintf("caller %s has moderate call frequency (score: %d), monitoring", callerID, score)
		result.Blocked = false

	default:
		result.Status = StatusRed
		if e.cfg.AuditMode {
			result.Reason = fmt.Sprintf("caller %s exceeds threshold (score: %d); AUDIT_MODE active, not blocking", callerID, score)
			result.Blocked = false
		} else {
			result.Reason = fmt.Sprintf("caller %s exceeds threshold (score: %d), call blocked", callerID, score)
			result.Blocked = true
		}
	}

	return result
}

func (e *Engine) ShouldBlock(result *ScoreResult) bool {
	if e.cfg.AuditMode {
		return false
	}
	return result.Status == StatusRed
}

func (e *Engine) GetStats(ctx context.Context) (map[string]int64, error) {
	stats := make(map[string]int64)
	for _, status := range []Status{StatusGreen, StatusYellow, StatusRed} {
		key := fmt.Sprintf("stats:%s", status)
		count, err := e.redis.Get(ctx, key).Int64()
		if err == redis.Nil {
			count = 0
		} else if err != nil {
			return nil, fmt.Errorf("redis get stats %s: %w", status, err)
		}
		stats[string(status)] = count
	}
	return stats, nil
}

func (e *Engine) GetWhitelist() *Whitelist {
	return e.whitelist
}

func (e *Engine) GetGreylist() *Greylist {
	return e.greylist
}

func tierToStatus(tier string) Status {
	switch tier {
	case "TELCO":
		return StatusGreen
	case "CLOUD":
		return StatusRed
	default:
		return Status(tier)
	}
}

func (e *Engine) incrementStats(ctx context.Context, status Status) {
	key := fmt.Sprintf("stats:%s", status)
	e.redis.Incr(ctx, key)
}
