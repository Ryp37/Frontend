package scoring

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func newTestGreylist(ttlSec int) *Greylist {
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		DB:   15,
	})
	return NewGreylist(rdb, ttlSec)
}

func TestGreylist_AddAndIsGreylisted(t *testing.T) {
	gl := newTestGreylist(3600)
	ctx := context.Background()
	callerID := "+46701110001"

	if err := gl.Add(ctx, callerID); err != nil {
		t.Skipf("Redis not available, skipping integration test: %v", err)
	}
	defer gl.redis.Del(ctx, greylistKeyPrefix+callerID)

	ok, err := gl.IsGreylisted(ctx, callerID)
	if err != nil {
		t.Fatalf("IsGreylisted error: %v", err)
	}
	if !ok {
		t.Error("expected caller to be greylisted")
	}
}

func TestGreylist_Remove(t *testing.T) {
	gl := newTestGreylist(3600)
	ctx := context.Background()
	callerID := "+46701110002"

	if err := gl.Add(ctx, callerID); err != nil {
		t.Skipf("Redis not available, skipping integration test: %v", err)
	}

	if err := gl.Remove(ctx, callerID); err != nil {
		t.Fatalf("Remove error: %v", err)
	}

	ok, err := gl.IsGreylisted(ctx, callerID)
	if err != nil {
		t.Fatalf("IsGreylisted error: %v", err)
	}
	if ok {
		t.Error("caller should no longer be greylisted after Remove")
	}
}

func TestGreylist_RemoveNotFound(t *testing.T) {
	gl := newTestGreylist(3600)
	err := gl.Remove(context.Background(), "+46799999999")
	if err == nil {
		t.Error("expected error when removing non-existent greylist entry")
	}
}

func TestGreylist_TTLSet(t *testing.T) {
	gl := newTestGreylist(60)
	ctx := context.Background()
	callerID := "+46701110003"

	if err := gl.Add(ctx, callerID); err != nil {
		t.Skipf("Redis not available, skipping integration test: %v", err)
	}
	defer gl.redis.Del(ctx, greylistKeyPrefix+callerID)

	ttl, err := gl.redis.TTL(ctx, greylistKeyPrefix+callerID).Result()
	if err != nil {
		t.Fatalf("TTL error: %v", err)
	}
	if ttl <= 0 || ttl > 60*time.Second {
		t.Errorf("unexpected TTL: %v", ttl)
	}
}

func TestGreylist_List(t *testing.T) {
	gl := newTestGreylist(3600)
	ctx := context.Background()
	callerID := "+46701110004"

	if err := gl.Add(ctx, callerID); err != nil {
		t.Skipf("Redis not available, skipping integration test: %v", err)
	}
	defer gl.redis.Del(ctx, greylistKeyPrefix+callerID)

	entries, err := gl.List(ctx)
	if err != nil {
		t.Fatalf("List error: %v", err)
	}

	found := false
	for _, e := range entries {
		if e.CallerID == callerID {
			found = true
			if e.TTLRemaining <= 0 {
				t.Error("expected positive TTL remaining")
			}
		}
	}
	if !found {
		t.Errorf("caller %s not found in greylist listing", callerID)
	}
}

func TestGreylist_AutoExpiry(t *testing.T) {
	gl := newTestGreylist(1)
	ctx := context.Background()
	callerID := "+46701110005"

	if err := gl.Add(ctx, callerID); err != nil {
		t.Skipf("Redis not available, skipping integration test: %v", err)
	}

	time.Sleep(1500 * time.Millisecond)

	ok, err := gl.IsGreylisted(ctx, callerID)
	if err != nil {
		t.Fatalf("IsGreylisted error: %v", err)
	}
	if ok {
		t.Error("greylist entry should have expired after TTL")
	}
}
