package shared

import (
	"errors"
	"strings"

	"github.com/velt/backend/internal/platform/slug"
)

// UniqueSlug resolves a collision-free slug. Kept as a thin alias so CMS
// call sites stay unchanged; the implementation lives in platform/slug,
// which products and members share.
func UniqueSlug(exists func(string) (bool, error), base string) (string, error) {
	return slug.Unique(exists, base)
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

// Slugify turns a title into an ASCII kebab-case slug (Vietnamese diacritics
// folded). Thin alias over platform/slug so CMS call sites stay unchanged.
func Slugify(s string) string { return slug.Make(s) }
