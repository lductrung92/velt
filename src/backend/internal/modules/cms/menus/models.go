// Package menus is the CMS navigation feature: slots (cms_menus) and their item
// trees (cms_menu_items). Item targets are polymorphic (article/page/category by
// opaque target_id, or internal/external URL) and resolved at the public API, so
// this package references no other CMS feature's types.
package menus

import (
	"time"

	"github.com/google/uuid"
)

// permManage gates every menu endpoint.
const permManage = "cms.menu.manage"

// Link-type values (cms_menu_items.link_type CHECK). internal/external use `url`;
// article/page/category use `target_id` (polymorphic, resolved at public API).
const (
	LinkInternal = "internal"
	LinkExternal = "external"
	LinkArticle  = "article"
	LinkPage     = "page"
	LinkCategory = "category"
)

// Menu is a navigation slot row (cms_menus).
type Menu struct {
	ID        uuid.UUID
	Name      string
	Location  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// itemRow is a flat cms_menu_items row (assembled into a tree by the service).
type itemRow struct {
	ID          uuid.UUID
	ParentID    *uuid.UUID
	Label       string
	Description *string
	LinkType   string
	TargetID   *uuid.UUID
	URL        *string
	OpenNewTab bool
	SortOrder  int
}

// itemWrite is one node to persist on a tree replace (children nested).
// sort_order is assigned from slice order by the repo.
type itemWrite struct {
	// ID is the row to keep; nil means a new item.
	ID          *uuid.UUID
	Label       string
	Description *string
	LinkType    string
	TargetID   *uuid.UUID
	URL        *string
	OpenNewTab bool
	Children   []itemWrite
}

// --- Requests ---

// CreateRequest creates a navigation slot. location is UNIQUE.
type CreateRequest struct {
	Name     string `json:"name" validate:"required,max=200"`
	Location string `json:"location" validate:"required,max=100"`
}

// UpdateRequest patches a menu slot.
type UpdateRequest struct {
	Name     *string `json:"name" validate:"omitempty,max=200"`
	Location *string `json:"location" validate:"omitempty,max=100"`
}

// ItemInput is one node in the PUT /menus/{id}/items tree replace.
type ItemInput struct {
	// ID identifies an item that already exists, so a save keeps it rather than
	// replacing it with a copy — anything stored against the item (its
	// translated label) stays attached. Absent = a new item.
	ID          *uuid.UUID  `json:"id"`
	Label       string      `json:"label" validate:"required,max=200"`
	Description *string     `json:"description" validate:"omitempty,max=300"`
	LinkType   string      `json:"link_type" validate:"required,oneof=internal external article page category"`
	TargetID   *uuid.UUID  `json:"target_id"`
	URL        *string     `json:"url" validate:"omitempty,max=2000"`
	OpenNewTab bool        `json:"open_new_tab"`
	Children   []ItemInput `json:"children" validate:"omitempty,dive"`
}

// ItemsRequest is the PUT /menus/{id}/items body (whole tree replace).
type ItemsRequest struct {
	Items []ItemInput `json:"items" validate:"omitempty,max=200,dive"`
}

// --- Responses ---

// Response is a menu slot (no items) — the list shape.
type Response struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Location  string    `json:"location"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ItemNode is a menu item in the detail tree.
type ItemNode struct {
	ID          uuid.UUID  `json:"id"`
	Label       string     `json:"label"`
	Description *string    `json:"description"`
	LinkType   string     `json:"link_type"`
	TargetID   *uuid.UUID `json:"target_id"`
	URL        *string    `json:"url"`
	OpenNewTab bool       `json:"open_new_tab"`
	SortOrder  int        `json:"sort_order"`
	Children   []ItemNode `json:"children"`
}

// DetailResponse is a menu slot + its item tree (GET /menus/{id}, PUT items).
type DetailResponse struct {
	Response
	Items []ItemNode `json:"items"`
}

// toResponse converts via struct identity — Menu and Response MUST keep the same
// field order/types (lockstep, else JSON remaps silently).
func toResponse(m Menu) Response { return Response(m) }

// buildItemTree assembles flat rows (ordered by parent, sort_order) into a nested
// tree. Rows whose parent is absent from the set become roots.
func buildItemTree(rows []itemRow) []ItemNode {
	type node struct {
		item     ItemNode
		children []*node
	}
	byID := make(map[uuid.UUID]*node, len(rows))
	for _, r := range rows {
		byID[r.ID] = &node{item: ItemNode{
			ID: r.ID, Label: r.Label, Description: r.Description,
			LinkType: r.LinkType, TargetID: r.TargetID,
			URL: r.URL, OpenNewTab: r.OpenNewTab, SortOrder: r.SortOrder,
		}}
	}
	roots := []*node{}
	for _, r := range rows {
		n := byID[r.ID]
		if r.ParentID != nil {
			if p, ok := byID[*r.ParentID]; ok {
				p.children = append(p.children, n)
				continue
			}
		}
		roots = append(roots, n)
	}
	var materialize func(n *node) ItemNode
	materialize = func(n *node) ItemNode {
		out := n.item
		out.Children = make([]ItemNode, 0, len(n.children))
		for _, c := range n.children {
			out.Children = append(out.Children, materialize(c))
		}
		return out
	}
	result := make([]ItemNode, 0, len(roots))
	for _, n := range roots {
		result = append(result, materialize(n))
	}
	return result
}
