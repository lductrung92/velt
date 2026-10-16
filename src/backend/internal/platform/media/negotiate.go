package media

import (
	"strconv"
	"strings"
)

// Negotiate picks the format for the width-less /img/{slug}.{ext} URL: WebP when
// the client said it understands WebP, otherwise the format fallback (what the
// URL's own extension, or the stored bytes, already are).
//
// Only an explicit "image/webp" counts. Every browser that can decode WebP sends
// it, while "*/*" is what curl, crawlers and old clients send — treating the
// wildcard as consent would hand WebP to the one population that cannot read it.
//
// The result is one of three values on purpose: the response is cached under it,
// and keying the cache on the raw Accept string would shatter one image into
// dozens of near-identical entries (design §4).
func Negotiate(accept string, fallback Format) Format {
	for _, part := range strings.Split(accept, ",") {
		typ, q := parseAcceptPart(part)
		if typ == "image/webp" && q > 0 {
			return FormatWebP
		}
	}
	return fallback
}

// parseAcceptPart splits one Accept entry into its media type and q-value.
// A missing q is 1 per RFC 9110; "image/webp;q=0" means "I cannot read this",
// which is the only reason the weight is read at all.
func parseAcceptPart(part string) (string, float64) {
	fields := strings.Split(part, ";")
	typ := strings.ToLower(strings.TrimSpace(fields[0]))
	q := 1.0
	for _, f := range fields[1:] {
		f = strings.TrimSpace(f)
		if v, ok := strings.CutPrefix(strings.ToLower(f), "q="); ok {
			parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
			if err != nil {
				return typ, 0 // unparseable weight: do not upgrade on a guess
			}
			q = parsed
		}
	}
	return typ, q
}
