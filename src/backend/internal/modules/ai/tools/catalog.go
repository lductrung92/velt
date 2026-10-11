package tools

import (
	"context"
	"encoding/json"
	"strings"
)

// Tool names. Kept as constants so an allowlist cannot drift from a rename.
const (
	NameSearchProducts = "search_products"
	NameGetProduct     = "get_product"
	NameListMembers    = "list_members"
)

// CatalogPort is the slice of the products context the assistant may read.
//
// Deliberately narrow, and deliberately phrased in terms of PUBLISHED data: the
// implementation reads products.published_snapshot, so a draft edit can never
// reach a visitor through the assistant. See docs/domains/ai/README.md §3.
type CatalogPort interface {
	SearchPublished(ctx context.Context, query string, limit int) ([]CatalogItem, error)
	GetPublished(ctx context.Context, slug string) (*CatalogDetail, error)
}

// RosterPort is the slice of the members context the assistant may read: the
// public roster, exactly what the site already shows.
type RosterPort interface {
	ListActive(ctx context.Context) ([]Person, error)
}

// CatalogItem is a product as the model sees it in a list.
type CatalogItem struct {
	Slug       string   `json:"slug"`
	Name       string   `json:"name"`
	Summary    string   `json:"summary,omitempty"`
	Lifecycle  string   `json:"lifecycle"`
	Audience   []string `json:"audience,omitempty"`
	Platforms  []string `json:"platforms,omitempty"`
	Categories []string `json:"categories,omitempty"`
}

// CatalogDetail is one product in full — still without anything commercial.
//
// There is no price field and there must never be one: the assistant is barred
// from discussing price by having no price to discuss, which holds even when
// the model is argued with. See docs/domains/ai/README.md §4.
type CatalogDetail struct {
	CatalogItem
	Description      string   `json:"description,omitempty"`
	TechStack        []string `json:"tech_stack,omitempty"`
	Highlights       []string `json:"highlights,omitempty"`
	Version          string   `json:"version,omitempty"`
	ReleasedAt       string   `json:"released_at,omitempty"`
	ProductURL       string   `json:"product_url,omitempty"`
	DemoURL          string   `json:"demo_url,omitempty"`
	DemoAccess       string   `json:"demo_access,omitempty"`
	DemoInstructions []string `json:"demo_instructions,omitempty"`
	Members          []Person `json:"members,omitempty"`
}

// Person is a team member as the model sees them.
type Person struct {
	Slug     string   `json:"slug"`
	FullName string   `json:"full_name"`
	Role     string   `json:"role,omitempty"`
	Skills   []string `json:"skills,omitempty"`
}

// RegisterCatalog adds the read-only catalog tools.
func RegisterCatalog(r *Registry, catalog CatalogPort, roster RosterPort) {
	r.Add(Tool{
		Name: NameSearchProducts,
		Description: "Tìm sản phẩm Zukatek đã công bố theo từ khoá hoặc nhu cầu. " +
			"Dùng khi khách mô tả vấn đề của họ. Trả về danh sách tóm tắt.",
		Schema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"query": map[string]any{
					"type":        "string",
					"description": "Từ khoá hoặc mô tả nhu cầu, ví dụ 'quản lý kho'",
				},
			},
			"required": []string{"query"},
		},
		Run: func(ctx context.Context, raw json.RawMessage) (any, error) {
			var in struct {
				Query string `json:"query"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return nil, err
			}
			items, err := catalog.SearchPublished(ctx, strings.TrimSpace(in.Query), 10)
			if err != nil {
				return nil, err
			}
			return map[string]any{"items": items}, nil
		},
	})

	r.Add(Tool{
		Name: NameGetProduct,
		Description: "Lấy chi tiết một sản phẩm Zukatek theo slug, gồm mô tả, " +
			"nền tảng, cách dùng thử và đội ngũ phát triển. Không có thông tin giá.",
		Schema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"slug": map[string]any{"type": "string"},
			},
			"required": []string{"slug"},
		},
		Run: func(ctx context.Context, raw json.RawMessage) (any, error) {
			var in struct {
				Slug string `json:"slug"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return nil, err
			}
			d, err := catalog.GetPublished(ctx, strings.TrimSpace(in.Slug))
			if err != nil {
				return nil, err
			}
			if d == nil {
				// A plain answer, not an error: "no such product" is something
				// the model should say out loud rather than retry around.
				return map[string]any{"found": false}, nil
			}
			return d, nil
		},
	})

	r.Add(Tool{
		Name:        NameListMembers,
		Description: "Danh sách thành viên đội ngũ Zukatek đang hoạt động.",
		Schema:      map[string]any{"type": "object", "properties": map[string]any{}},
		Run: func(ctx context.Context, _ json.RawMessage) (any, error) {
			people, err := roster.ListActive(ctx)
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": people}, nil
		},
	})
}

// VisitorAllowlist is everything the site assistant may call: three reads and
// exactly one write. Short enough to check by eye — which is the point.
var VisitorAllowlist = []string{
	NameSearchProducts, NameGetProduct, NameListMembers, NameCreateLead,
}
