package shared

import (
	"errors"
	"fmt"
	"strings"
)

// UniqueSlug returns base, or base-01 / base-02 / … — the first candidate for
// which exists() reports false. The 2-digit suffix starts at -01. exists() is
// entity-scoped (e.g. excludes the row being edited, scopes by parent for pages).
func UniqueSlug(exists func(string) (bool, error), base string) (string, error) {
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

// WriteWithUniqueSlug resolves a collision-free slug from base and writes it,
// retrying if a concurrent insert grabbed the same slug first (DB unique
// violation → ErrConflict). This is how every slug-bearing entity avoids ever
// surfacing a duplicate-slug error.
func WriteWithUniqueSlug[T any](
	exists func(string) (bool, error),
	base string,
	write func(slug string) (T, error),
) (T, error) {
	var zero T
	for attempt := 0; attempt < 6; attempt++ {
		slug, err := UniqueSlug(exists, base)
		if err != nil {
			return zero, err
		}
		res, err := write(slug)
		if errors.Is(err, ErrConflict) {
			continue // raced another writer — recompute the next free suffix
		}
		return res, err
	}
	return zero, ErrConflict
}

// PersistWithSlug writes an entity honoring the slug mode (business-rules §1):
//   - allowManualEdit = true (flag ON): the slug is user-controlled, so a
//     collision must surface — write base as-is and let the caller map the
//     repo's ErrConflict to slug_already_exists.
//   - allowManualEdit = false (flag OFF): the slug is system-managed — auto-suffix
//     -NN so it never collides.
func PersistWithSlug[T any](
	allowManualEdit bool,
	exists func(string) (bool, error),
	base string,
	write func(slug string) (T, error),
) (T, error) {
	if allowManualEdit {
		return write(base)
	}
	return WriteWithUniqueSlug(exists, base, write)
}

// ResolveSlug returns a normalized slug from an explicit value (if given) else
// derived from the name.
func ResolveSlug(provided *string, name string) string {
	if provided != nil && strings.TrimSpace(*provided) != "" {
		return Slugify(*provided)
	}
	return Slugify(name)
}

// CreateSlugBase resolves the slug base for a create. Manual mode honors an
// explicit slug; auto mode always derives from the name.
func CreateSlugBase(allowManualEdit bool, provided *string, name string) string {
	if allowManualEdit {
		return ResolveSlug(provided, name)
	}
	return Slugify(name)
}

// UpdateSlugPlan decides whether/how a PATCH changes the slug:
//   - manual mode (flag ON): an explicit slug changes it (collision rejected);
//     otherwise keep.
//   - auto mode (flag OFF): the regenerate flag re-derives it from the (new) name
//     (auto-suffix); otherwise keep.
//
// change=false ⇒ keep the current slug untouched.
func UpdateSlugPlan(allowManualEdit, regenerate bool, provided *string, name string) (base string, change bool) {
	if allowManualEdit {
		if provided != nil {
			return Slugify(*provided), true
		}
		return "", false
	}
	if regenerate {
		return Slugify(name), true
	}
	return "", false
}

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

// Slugify turns a title into an ASCII kebab-case slug: Vietnamese diacritics are
// folded to their base letter, everything else is lowercased, and any run of
// non-alphanumeric characters collapses to a single hyphen (trimmed at the ends).
// An input with no usable characters yields "".
func Slugify(s string) string {
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
