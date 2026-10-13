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
// `slug` is declared only for the entities that publish a locale-keyed row into
// published_docs. The rest resolve their slug against their own table, so a
// translated slug would hand a visitor a URL that 404s — and an input box that
// is silently ignored is a faster way to lose trust in a feature than not
// offering it at all.
var declarations = []Declaration{
	{
		Entity: EntityArticle,
		Fields: []string{"slug", "title", "excerpt", "body_html", "seo"},
	},
	// A static page is mostly its body. Translating only its title would leave
	// an English heading over Vietnamese prose, with nothing else on the page to
	// carry it — worse than the half-translated state the fallback rule exists
	// to make tolerable.
	{
		Entity: EntityPage,
		Fields: []string{"slug", "title", "body_html", "seo"},
	},
	{
		Entity: EntityProduct,
		Fields: []string{"slug", "name", "summary", "body_html", "highlights", "seo"},
	},
	{
		Entity: EntityProductCategory,
		Fields: []string{"name", "description", "seo"},
	},
	{
		Entity: EntityCMSCategory,
		Fields: []string{"name", "description", "seo"},
	},
	{
		Entity: EntityMember,
		Fields: []string{"role", "bio"},
	},
	// The site's navigation. A menu item is a label and, in the header's
	// dropdown, one line under it. Its target is not translated: an entity link
	// already resolves to the slug of the language being read, and an internal
	// path is the same address in every language.
	{
		Entity: EntityMenuItem,
		Fields: []string{"label", "description"},
	},
	// The words around that navigation — the footer blurb, the last column, the
	// copyright line, the header button. They are settings rather than a record,
	// so they translate as ONE singleton whose id is fixed (see SiteChromeID):
	// six keys that always travel together, edited on one screen, read on every
	// page.
	{
		Entity: EntitySiteChrome,
		Fields: []string{
			"brand_tagline",
			"footer_note_title",
			"footer_note_text",
			"footer_copyright",
			"header_cta_label",
			"header_cta_url",
		},
	},
}

// Entity keys. They are the first segment of every translation route, so they
// are part of the HTTP contract and must match the owning module's own constant.
const (
	EntityArticle         = "article"
	EntityPage            = "page"
	EntityProduct         = "product"
	EntityProductCategory = "product_category"
	EntityCMSCategory     = "cms_category"
	EntityMember          = "member"
	EntityMenuItem        = "menu_item"
	EntitySiteChrome      = "site_chrome"
)

// SiteChromeID is the id every site_chrome translation is stored against.
//
// The chrome is one record that happens to live in the settings table, so it
// has no id of its own; the store's key is (entity, entity_id, locale) and
// needs one. A fixed uuid is the smallest honest answer: it names the single
// instance, and an id that is not this one is rejected by the gate.
var SiteChromeID = uuid.MustParse("00000000-0000-0000-0000-00005174e000")

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
