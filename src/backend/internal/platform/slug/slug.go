// Package slug turns human titles into ASCII kebab-case URL slugs and resolves
// collisions. It lives in platform because it is pure string handling with no
// domain knowledge — every slug-bearing bounded context (cms, products, members)
// needs it, and none of them should import another's spine to get it.
package slug

import (
	"errors"
	"fmt"
	"strings"
)

// viFold maps lowercase Vietnamese letters (NFC precomposed) to their ASCII base
// so slugs are clean ASCII kebab-case.
var viFold = map[rune]rune{
	'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
	'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
	'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
	'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
	'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
	'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
	'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
	'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
	'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
	'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
	'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
	'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
	'đ': 'd',
}

// Make turns a title into an ASCII kebab-case slug: Vietnamese diacritics are
// folded to their base letter, everything else is lowercased, and any run of
// non-alphanumeric characters collapses to a single hyphen (trimmed at the ends).
// An input with no usable characters yields "".
func Make(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	b.Grow(len(s))
	prevHyphen := false
	for _, r := range s {
		if f, ok := viFold[r]; ok {
			r = f
		}
		switch {
		case r >= 0x0300 && r <= 0x036f:
			// Combining diacritical mark (NFD input) — drop, keep the base letter.
			continue
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			prevHyphen = false
		default:
			if !prevHyphen && b.Len() > 0 {
				b.WriteByte('-')
				prevHyphen = true
			}
		}
	}
	return strings.TrimRight(b.String(), "-")
}

// Unique returns base, or base-01 / base-02 / … — the first candidate for which
// exists() reports false. The 2-digit suffix starts at -01. exists() is
// entity-scoped (e.g. excludes the row being edited, scopes by parent for pages).
func Unique(exists func(string) (bool, error), base string) (string, error) {
	for i := 0; i <= 9999; i++ {
		cand := base
		if i > 0 {
			cand = fmt.Sprintf("%s-%02d", base, i)
		}
		taken, err := exists(cand)
		if err != nil {
			return "", err
		}
		if !taken {
			return cand, nil
		}
	}
	return "", errors.New("slug space exhausted")
}
