package scoring

import (
	"context"
	"testing"

	"github.com/redis/go-redis/v9"
	"sipguard/internal/config"
)

func newTestEngine(auditMode bool) *Engine {
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		DB:   15,
	})
	cfg := &config.Config{
		AuditMode:      auditMode,
		GreenThreshold: 10,
		RedThreshold:   50,
	}
	return NewEngine(rdb, cfg)
}

func TestClassify_Green(t *testing.T) {
	e := newTestEngine(false)
	result := e.classify(5, "+46701234567")
	if result.Status != StatusGreen {
		t.Errorf("expected GREEN, got %s", result.Status)
	}
	if result.Blocked {
		t.Error("GREEN calls should never be blocked")
	}
}

func TestClassify_Yellow(t *testing.T) {
	e := newTestEngine(false)
	result := e.classify(25, "+46701234567")
	if result.Status != StatusYellow {
		t.Errorf("expected YELLOW, got %s", result.Status)
	}
	if result.Blocked {
		t.Error("YELLOW calls should never be blocked")
	}
}

func TestClassify_Red_NotAuditMode(t *testing.T) {
	e := newTestEngine(false)
	result := e.classify(75, "+46701234567")
	if result.Status != StatusRed {
		t.Errorf("expected RED, got %s", result.Status)
	}
	if !result.Blocked {
		t.Error("RED calls without AUDIT_MODE should be blocked")
	}
}

func TestClassify_Red_AuditMode(t *testing.T) {
	e := newTestEngine(true)
	result := e.classify(75, "+46701234567")
	if result.Status != StatusRed {
		t.Errorf("expected RED, got %s", result.Status)
	}
	if result.Blocked {
		t.Error("RED calls in AUDIT_MODE should not be blocked")
	}
}

func TestClassify_BoundaryGreenYellow(t *testing.T) {
	e := newTestEngine(false)

	below := e.classify(9, "+46701234567")
	if below.Status != StatusGreen {
		t.Errorf("score 9 should be GREEN, got %s", below.Status)
	}

	at := e.classify(10, "+46701234567")
	if at.Status != StatusYellow {
		t.Errorf("score 10 should be YELLOW, got %s", at.Status)
	}
}

func TestClassify_BoundaryYellowRed(t *testing.T) {
	e := newTestEngine(false)

	at := e.classify(50, "+46701234567")
	if at.Status != StatusYellow {
		t.Errorf("score 50 should be YELLOW, got %s", at.Status)
	}

	above := e.classify(51, "+46701234567")
	if above.Status != StatusRed {
		t.Errorf("score 51 should be RED, got %s", above.Status)
	}
}

func TestShouldBlock_AuditModeAlwaysFalse(t *testing.T) {
	e := newTestEngine(true)
	result := &ScoreResult{Status: StatusRed, Blocked: true}
	if e.ShouldBlock(result) {
		t.Error("ShouldBlock should always return false in AUDIT_MODE")
	}
}

func TestShouldBlock_NonAudit_Red(t *testing.T) {
	e := newTestEngine(false)
	result := &ScoreResult{Status: StatusRed}
	if !e.ShouldBlock(result) {
		t.Error("ShouldBlock should return true for RED in non-audit mode")
	}
}

func TestShouldBlock_NonAudit_Green(t *testing.T) {
	e := newTestEngine(false)
	result := &ScoreResult{Status: StatusGreen}
	if e.ShouldBlock(result) {
		t.Error("ShouldBlock should return false for GREEN")
	}
}

func TestWhitelistMatch(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		DB:   15,
	})
	wl := NewWhitelist(rdb)

	entry := &WhitelistEntry{
		Prefix: "+467",
		Label:  "Swedish mobile",
		Tier:   "GREEN",
	}

	ctx := context.Background()
	if err := wl.Add(ctx, entry); err != nil {
		t.Skipf("Redis not available, skipping integration test: %v", err)
	}
	defer rdb.HDel(ctx, whitelistKey, "+467")

	match, err := wl.Match(ctx, "+46701234567")
	if err != nil {
		t.Fatalf("Match returned error: %v", err)
	}
	if match == nil {
		t.Fatal("expected a match, got nil")
	}
	if match.Tier != "GREEN" {
		t.Errorf("expected GREEN tier, got %s", match.Tier)
	}
}

func TestWhitelistAdd_InvalidTier(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15})
	wl := NewWhitelist(rdb)

	err := wl.Add(context.Background(), &WhitelistEntry{
		Prefix: "+467",
		Label:  "test",
		Tier:   "INVALID",
	})
	if err == nil {
		t.Error("expected error for invalid tier, got nil")
	}
}
