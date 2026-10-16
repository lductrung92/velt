// Package retention turns a named retention window — "keep the last 3 days" —
// into the instant before which rows are old enough to delete.
//
// It lives here because two unrelated modules purge on the same windows (the
// activity log and admin sessions) and the console offers one list of choices
// for both; the maths may not drift between them.
package retention

import "time"

// All is the window that keeps nothing.
const All = "all"

// Months and years are calendar steps, not 30- and 365-day blocks: somebody
// who asks to keep "1 tháng" means back to the same date last month.
type window struct{ years, months, days int }

var windows = map[string]window{
	"3d": {days: -3},
	"7d": {days: -7},
	"1m": {months: -1},
	"3m": {months: -3},
	"6m": {months: -6},
	"1y": {years: -1},
}

// Cutoff resolves a window code against now. Rows at or after the returned
// instant are KEPT, rows before it are deleted. All returns the zero time,
// which the callers read as "no lower bound — delete the lot". ok is false for
// a code nobody offers, which is a client mistake rather than "keep nothing".
func Cutoff(code string, now time.Time) (cutoff time.Time, ok bool) {
	if code == All {
		return time.Time{}, true
	}
	w, found := windows[code]
	if !found {
		return time.Time{}, false
	}
	return now.AddDate(w.years, w.months, w.days), true
}
