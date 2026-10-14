package httpx

import (
	"net/http"
	"strings"
	"time"

	"github.com/velt/backend/internal/apperr"
)

// vietnamOffset is the timezone the console works in, UTC+07:00. A fixed zone
// rather than time.LoadLocation("Asia/Ho_Chi_Minh"): Vietnam has observed no
// DST since 1975 so the offset never moves, and LoadLocation needs a tzdata
// database the host may not ship.
var vietnamOffset = time.FixedZone("+07", 7*60*60)

// dateOnly is the wire format of a date query param.
const dateOnly = "2006-01-02"

// QueryDateRange reads an optional ISO-date (YYYY-MM-DD) range from two query
// params, reading both in the console's Vietnam timezone, and returns the two
// instants a repository compares a timestamptz column against.
//
// The upper bound returned is MIDNIGHT AFTER the requested day, because "to 13
// Oct" means "through the end of 13 Oct" to the person who typed it. Callers
// must therefore compare `col >= from AND col < to` — a `<=` here would reach
// a day too far. from == to is a legal range selecting exactly that one day.
//
// Either side may be absent (nil). An unparseable value, or an end that
// precedes its start, is a 422 validation_error naming the offending param.
func QueryDateRange(r *http.Request, fromName, toName string) (from, to *time.Time, err error) {
	q := r.URL.Query()
	day := func(name string) (*time.Time, error) {
		raw := strings.TrimSpace(q.Get(name))
		if raw == "" {
			return nil, nil
		}
		d, err := time.ParseInLocation(dateOnly, raw, vietnamOffset)
		if err != nil {
			return nil, apperr.Validation(map[string]string{name: "invalid"})
		}
		return &d, nil
	}
	if from, err = day(fromName); err != nil {
		return nil, nil, err
	}
	if to, err = day(toName); err != nil {
		return nil, nil, err
	}
	// Ordering is checked on the two requested days, before the upper bound is
	// shifted, so an equal pair reads as the single day the user asked for.
	if from != nil && to != nil && to.Before(*from) {
		return nil, nil, apperr.Validation(map[string]string{fromName: "after_" + toName})
	}
	if to != nil {
		end := to.AddDate(0, 0, 1)
		to = &end
	}
	return from, to, nil
}
