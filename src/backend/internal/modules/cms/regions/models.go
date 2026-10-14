// Package regions is the CMS site-chrome feature: the ordered content of the
// slots around a page's body (cms_region_blocks). A block is either a widget
// (type + config, resolved at the public API) or a menu (by id, resolved
// through a port), so this package references no other CMS feature's types.
//
// A block is stored against a (page group, slot) pair, not against a slot
// alone: the group says WHICH KIND OF PAGE it belongs to, and descendant
// groups inherit it. See docs/domains/cms/regions.md.
package regions

import (
	"encoding/json"

	"github.com/google/uuid"
)

// permView gates reading the chrome, permManage editing it. Placing a menu in
// the header is editing the navigation, so the write gate is the menu one.
const (
	permView   = "cms.page.view"
	permManage = "cms.menu.manage"
)

// Page group values (cms_region_blocks.page_group): the kind of page a block
// belongs to. A closed vocabulary in Go, like the widget type ids, for the
// reason a CHECK constraint is not: the write path is the only way a row gets
// in, and the site grows a page kind more often than it wants a migration.
const (
	GroupCommon        = "common"
	GroupHome          = "home"
	GroupProducts      = "products"
	GroupProductList   = "product_list"
	GroupProductDetail = "product_detail"
	GroupBlog          = "blog"
	GroupBlogList      = "blog_list"
	GroupBlogDetail    = "blog_detail"
	GroupNotFound      = "not_found"
)

// Groups is the tree flattened parent-before-child, the order the editor reads
// it in.
//
// `products` and `blog` are grouping nodes: no page is ever classified as one.
// They exist so that "every product page" is one list rather than the same
// list entered twice, which is the thing inheritance was added to remove.
//
// There is deliberately no page_detail group. The site does not route /{slug}
// yet, so offering the group would invite blocks into a page nothing renders.
var Groups = []string{
	GroupCommon,
	GroupHome,
	GroupProducts, GroupProductList, GroupProductDetail,
	GroupBlog, GroupBlogList, GroupBlogDetail,
	GroupNotFound,
}

// parentOf is the inheritance chain, "" at the root. Declared apart from the
// matching rules on purpose: this is an EDITORIAL hierarchy, not a URL one —
// /products and /products/{slug} share a parent because an editor thinks of
// them as one thing, not because their paths nest.
var parentOf = map[string]string{
	GroupCommon:        "",
	GroupHome:          GroupCommon,
	GroupProducts:      GroupCommon,
	GroupProductList:   GroupProducts,
	GroupProductDetail: GroupProducts,
	GroupBlog:          GroupCommon,
	GroupBlogList:      GroupBlog,
	GroupBlogDetail:    GroupBlog,
	GroupNotFound:      GroupCommon,
}

// Slot values (cms_region_blocks.region — the column kept its name, the word
// did not; see migration 0044). A slot is a physical place in the markup, and
// this list is bounded by the markup that exists rather than by what would be
// nice to offer.
const (
	SlotHeader       = "header"
	SlotFooter       = "footer"
	SlotSidebarLeft  = "sidebar_left"
	SlotAfterArticle = "after_article"
	SlotAside        = "aside"
)

// commonSlots are the two places every page has.
var commonSlots = []string{SlotHeader, SlotFooter}

// extraSlots are the columns only one kind of page is laid out with. The home
// page and both listings are a single full-width column, so they have none.
var extraSlots = map[string][]string{
	GroupProductDetail: {SlotAside},
	GroupBlogDetail:    {SlotSidebarLeft, SlotAfterArticle},
}

// SlotsFor returns the slots a group allows, in render order. A pair outside
// this matrix is a 422 rather than a row: it would be a block sitting in the
// database that no page draws and nobody can account for.
func SlotsFor(group string) []string {
	return append(append([]string{}, commonSlots...), extraSlots[group]...)
}

// Block kinds (cms_region_blocks.kind CHECK). widget carries widget_type +
// config; menu carries menu_id.
const (
	KindWidget = "widget"
	KindMenu   = "menu"
)

// blockRow is a flat cms_region_blocks row. Region is the slot: the column
// name outlived the word.
type blockRow struct {
	ID         uuid.UUID
	Group      string
	Region     string
	Kind       string
	WidgetType *string
	MenuID     *uuid.UUID
	Config     json.RawMessage
	IsVisible  bool
}

// blockWrite is one block to persist on a region replace. sort_order is
// assigned from slice order by the repo.
type blockWrite struct {
	// ID is the row to keep; nil means a new block.
	ID         *uuid.UUID
	Kind       string
	WidgetType *string
	MenuID     *uuid.UUID
	Config     json.RawMessage
	IsVisible  bool
}

// --- Requests ---

// BlockInput is one block in the PUT /regions/{group}/{slot}/blocks list
// replace.
type BlockInput struct {
	// ID identifies a block that already exists, so a save keeps it rather
	// than replacing it with a copy — the row's id is the anchor anything
	// stored against the block hangs from. Absent = a new block.
	ID         *uuid.UUID      `json:"id"`
	Kind       string          `json:"kind" validate:"required,oneof=widget menu"`
	WidgetType *string         `json:"widget_type" validate:"omitempty,max=100"`
	MenuID     *uuid.UUID      `json:"menu_id"`
	Config     json.RawMessage `json:"config"`
	IsVisible  bool            `json:"is_visible"`
}

// BlocksRequest is the PUT /regions/{group}/{slot}/blocks body (whole-list
// replace).
type BlocksRequest struct {
	Blocks []BlockInput `json:"blocks" validate:"omitempty,max=100,dive"`
}

// --- Responses ---

// Block is one block of a slot as the staff API serves it.
type Block struct {
	ID         uuid.UUID       `json:"id"`
	Kind       string          `json:"kind"`
	WidgetType *string         `json:"widget_type"`
	MenuID     *uuid.UUID      `json:"menu_id"`
	Config     json.RawMessage `json:"config"`
	IsVisible  bool            `json:"is_visible"`
}

// SlotResponse is one (group, slot) list in render order.
type SlotResponse struct {
	Slot   string  `json:"slot"`
	Blocks []Block `json:"blocks"`
}

// GroupResponse is one page group with every slot it allows, filled or not.
type GroupResponse struct {
	Group string `json:"group"`
	// Parent is the group this one inherits from, "" at the root. The editor
	// has to show an inherited slot as inherited rather than as empty, and it
	// can only do that knowing the chain — sending it keeps the tree declared
	// in one place instead of copied into a second.
	Parent string         `json:"parent"`
	Slots  []SlotResponse `json:"slots"`
}

// toBlock drops the row's group and slot: the caller already knows which list
// it is building, and repeating it on every element invites the two to
// disagree.
func toBlock(r blockRow) Block {
	return Block{
		ID: r.ID, Kind: r.Kind, WidgetType: r.WidgetType,
		MenuID: r.MenuID, Config: r.Config, IsVisible: r.IsVisible,
	}
}

// toBlocks converts one slot's rows, preserving query order.
func toBlocks(rows []blockRow) []Block {
	out := make([]Block, 0, len(rows))
	for _, r := range rows {
		out = append(out, toBlock(r))
	}
	return out
}
