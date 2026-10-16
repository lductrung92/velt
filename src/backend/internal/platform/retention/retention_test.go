package retention_test

import (
	"testing"
	"time"

	"github.com/velt/backend/internal/platform/retention"
)

var now = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

// The whole point of a window: a row inside it survives, a row outside it does
// not. Asserted on the boundary the repositories actually compare against.
func TestCutoff_KeepsInsideDeletesOutside(t *testing.T) {
	cutoff, ok := retention.Cutoff("3d", now)
	if !ok {
		t.Fatal("3d should be a known window")
	}
	twoDaysOld := now.Add(-2 * 24 * time.Hour)
	fourDaysOld := now.Add(-4 * 24 * time.Hour)
	if twoDaysOld.Before(cutoff) {
		t.Errorf("a 2-day-old row must be kept: %v is before cutoff %v", twoDaysOld, cutoff)
	}
	if !fourDaysOld.Before(cutoff) {
		t.Errorf("a 4-day-old row must be deleted: %v is not before cutoff %v", fourDaysOld, cutoff)
	}
}

func TestCutoff_Windows(t *testing.T) {
	cases := map[string]time.Time{
		"3d": time.Date(2026, 10, 12, 12, 0, 0, 0, time.UTC),
		"7d": time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC),
		"1m": time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC),
		"3m": time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC),
		"6m": time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC),
		"1y": time.Date(2025, 10, 15, 12, 0, 0, 0, time.UTC),
	}
	for code, want := range cases {
		got, ok := retention.Cutoff(code, now)
		if !ok {
			t.Fatalf("%s should be a known window", code)
		}
		if !got.Equal(want) {
			t.Errorf("%s: cutoff = %v, want %v", code, got, want)
		}
	}
}

// "all" keeps nothing, and says so with a zero time rather than an instant the
// callers would have to compare against.
func TestCutoff_All(t *testing.T) {
	got, ok := retention.Cutoff(retention.All, now)
	if !ok {
		t.Fatal("all should be a known window")
	}
	if !got.IsZero() {
		t.Errorf("all: cutoff = %v, want the zero time", got)
	}
}

func TestCutoff_Unknown(t *testing.T) {
	if _, ok := retention.Cutoff("2w", now); ok {
		t.Error("an unoffered window must be rejected, not silently accepted")
	}
	if _, ok := retention.Cutoff("", now); ok {
		t.Error("an empty window must be rejected")
	}
}
