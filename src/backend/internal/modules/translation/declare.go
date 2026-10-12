// Package translation stores the draft-side translations of user-entered content.
//
// It owns no content. Each content module keeps its Vietnamese row exactly as it
// is and hands this module a narrow port; at publish time the owning module folds
// the translated values into the public read model (internal/platform/pubdocs).
//
// Design: docs/domains/translation/README.md. HTTP contract:
// docs/apis/translation-api.md.
package translation

import (
	"context"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
)

// Declaration says which fields of one entity may be translated, and which of
// them feed the search index of the published document.
//
// This is the only place that knowledge lives. Adding an entity is a line here,
// not a migration — the values are JSONB.
type Declaration struct {
	Entity string
	// Fields is a contract, not a hint: a write to anything outside it is
	// rejected. It stops a translation from quietly overwriting something nobody
	// meant to be translatable — status, sort order, a price, a date.
	Fields []string
}

// declarations lists every translatable entity.
//
// Only `article` for now: the other six are wired one at a time, because an
// entity declared here but not folded into its module's publish path would
// accept translations that never reach a page.
var declarations = []Declaration{
	{
		Entity: EntityArticle,
		Fields: []string{"slug", "title", "excerpt", "body_html", "seo"},
	},
}

// EntityArticle is the entity key for a CMS article.
const EntityArticle = "article"

// Declared returns the declaration for an entity, or false if it is not
// translatable. To a caller, an undeclared entity does not exist.
func Declared(entity string) (Declaration, bool) {
	for _, d := range declarations {
		if d.Entity == entity {
			return d, true
		}
	}
	return Declaration{}, false
}

// Allows reports whether the entity declares this field.
func (d Declaration) Allows(field string) bool {
	for _, f := range d.Fields {
		if f == field {
			return true
		}
	}
	return false
}

// Authorizer answers whether the actor may edit a given record's text. It is
// supplied at wiring time by each owning module, so this package never learns
// what `cms.article.edit` means and the CMS keeps its own author-only rule.
type Authorizer func(ctx context.Context, id *httpx.Identity, entity string, entityID uuid.UUID) error
