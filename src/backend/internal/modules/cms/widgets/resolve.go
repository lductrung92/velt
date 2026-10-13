package widgets

import (
	"context"
	"encoding/json"
)

// --- games_list ---

// GameItem is the resolved, web-ready shape of a game inside a games_list widget.
type GameItem struct {
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Description *string  `json:"description"`
	AgeGroup    string   `json:"age_group"`
	Subject     *string  `json:"subject"`
	Skills      []string `json:"skills"`
	CoverURL    *string  `json:"cover_url"`
	PlayURL     string   `json:"play_url"`
	AccessTier  string   `json:"access_tier"`
}

// GamesQuery is the resolved filter a games_list config maps to.
type GamesQuery struct {
	// Locale is the language the page is being read in. Empty means the base
	// language, which is what every port falls back to anyway.
	Locale   string
	AgeGroup string
	Subject  string
	Skill    string
	Q        string
	Sort     string
	Limit    int
}

// GamesPort is the games data the resolver needs.
type GamesPort interface {
	ListGames(ctx context.Context, q GamesQuery) ([]GameItem, error)
}

// --- articles_list ---

// ArticleItem is a published-article card (text-only for v1; no featured image).
type ArticleItem struct {
	Slug        string  `json:"slug"`
	Title       string  `json:"title"`
	Excerpt     *string `json:"excerpt"`
	PublishedAt *string `json:"published_at"`
}

// ArticlesQuery is the resolved filter an articles_list config maps to. CategoryID
// is the raw config string (the adapter parses it to a UUID).
type ArticlesQuery struct {
	Locale     string
	CategoryID string
	Tag        string
	Limit      int
}

// ArticlesPort is the published-articles data the resolver needs.
type ArticlesPort interface {
	ListArticles(ctx context.Context, q ArticlesQuery) ([]ArticleItem, error)
}

// --- categories_showcase ---

// CategoryItem is a category card (name/slug + article count).
type CategoryItem struct {
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// CategoriesQuery is the resolved filter a categories_showcase config maps to.
type CategoriesQuery struct {
	Locale string
	Limit  int
}

// CategoriesPort is the categories data the resolver needs.
type CategoriesPort interface {
	ListCategories(ctx context.Context, q CategoriesQuery) ([]CategoryItem, error)
}

// Ports bundles the data sources a Resolver needs (cross-module DI). Any may be
// nil — that widget then resolves to an empty list.
type Ports struct {
	Games      GamesPort
	Articles   ArticlesPort
	Categories CategoriesPort
	Products   ProductsPort
	Members    MembersPort
}

// --- product_grid ---

// ProductItem is a published-product card, the same fields the public catalogue
// list serves — a landing grid and /products must not describe one product two
// different ways.
type ProductItem struct {
	Slug       string   `json:"slug"`
	Name       string   `json:"name"`
	Summary    *string  `json:"summary"`
	CoverURL   *string  `json:"cover_url"`
	Lifecycle  string   `json:"lifecycle"`
	IsFeatured bool     `json:"is_featured"`
	Audience   []string `json:"audience"`
	Platforms  []string `json:"platforms"`
	Categories []string `json:"categories"`
}

// ProductsQuery is the resolved filter a product_grid config maps to.
type ProductsQuery struct {
	Locale   string
	Category string
	Limit    int
}

// ProductsPort is the published-catalogue data the resolver needs.
type ProductsPort interface {
	ListProducts(ctx context.Context, q ProductsQuery) ([]ProductItem, error)
}

// --- team ---

// MemberItem is an active team member as the public roster serves them.
type MemberItem struct {
	Slug      string   `json:"slug"`
	FullName  string   `json:"full_name"`
	Role      *string  `json:"role"`
	Bio       *string  `json:"bio"`
	AvatarURL *string  `json:"avatar_url"`
	Skills    []string `json:"skills"`
}

// MembersQuery is the resolved filter a team config maps to.
type MembersQuery struct {
	Locale string
	Limit  int
}

// MembersPort is the active-roster data the resolver needs.
type MembersPort interface {
	ListMembers(ctx context.Context, q MembersQuery) ([]MemberItem, error)
}

// Resolver turns a widget's stored config into fresh public data. Static widgets
// (rich_text, cta_banner) resolve to nil — the config IS the content.
type Resolver struct {
	ports Ports
}

// NewResolver builds a resolver over the given data ports.
func NewResolver(ports Ports) *Resolver { return &Resolver{ports: ports} }

// Resolve returns the data for one widget, or nil for static / not-yet-supported
// types. Errors are returned so the caller can null that widget without breaking
// the whole page.
func (r *Resolver) Resolve(ctx context.Context, typ string, config json.RawMessage) (any, error) {
	return r.ResolveIn(ctx, typ, config, "")
}

// ResolveIn is Resolve in one language. The words a widget wraps around its
// data are translated with the section; the DATA — article titles, product
// names, a member's role — belongs to the records, and this is what asks for
// them in the language being read. An empty locale, or a record with no copy in
// it, yields the base language.
func (r *Resolver) ResolveIn(ctx context.Context, typ string, config json.RawMessage, locale string) (any, error) {
	switch typ {
	case TypeGamesList:
		return r.resolveGamesList(ctx, config, locale)
	case TypeArticlesList:
		return r.resolveArticlesList(ctx, config, locale)
	case TypeCategoriesShowcase:
		return r.resolveCategoriesShowcase(ctx, config, locale)
	case TypeProductGrid:
		return r.resolveProductGrid(ctx, config, locale)
	case TypeTeam:
		return r.resolveTeam(ctx, config, locale)
	default:
		return nil, nil
	}
}

func clampLimit(n, def int) int {
	if n < 1 || n > 24 {
		return def
	}
	return n
}

type gamesListConfig struct {
	Filters struct {
		AgeGroup string `json:"age_group"`
		Subject  string `json:"subject"`
		Skill    string `json:"skill"`
		Q        string `json:"q"`
	} `json:"filters"`
	Limit int    `json:"limit"`
	Sort  string `json:"sort"`
}

func (r *Resolver) resolveGamesList(ctx context.Context, config json.RawMessage, locale string) (any, error) {
	if r.ports.Games == nil {
		return map[string]any{"items": []GameItem{}}, nil
	}
	var c gamesListConfig
	_ = json.Unmarshal(config, &c) // intentional: config is valid JSON (sanitized at write); a shape mismatch falls back to zero-value defaults below
	items, err := r.ports.Games.ListGames(ctx, GamesQuery{
		Locale:   locale,
		AgeGroup: c.Filters.AgeGroup, Subject: c.Filters.Subject,
		Skill: c.Filters.Skill, Q: c.Filters.Q, Sort: c.Sort, Limit: clampLimit(c.Limit, 8),
	})
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []GameItem{}
	}
	return map[string]any{"items": items}, nil
}

type articlesListConfig struct {
	Filters struct {
		CategoryID string `json:"category_id"`
		Tag        string `json:"tag"`
	} `json:"filters"`
	Limit int `json:"limit"`
}

type productGridConfig struct {
	Category string `json:"category"`
	Limit    int    `json:"limit"`
}

func (r *Resolver) resolveProductGrid(ctx context.Context, config json.RawMessage, locale string) (any, error) {
	if r.ports.Products == nil {
		return map[string]any{"items": []ProductItem{}}, nil
	}
	var c productGridConfig
	_ = json.Unmarshal(config, &c) // see resolveArticlesList: a shape mismatch falls back to defaults
	items, err := r.ports.Products.ListProducts(ctx, ProductsQuery{
		Locale:   locale,
		Category: c.Category, Limit: clampLimit(c.Limit, 6),
	})
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []ProductItem{}
	}
	return map[string]any{"items": items}, nil
}

type teamConfig struct {
	Limit int `json:"limit"`
}

func (r *Resolver) resolveTeam(ctx context.Context, config json.RawMessage, locale string) (any, error) {
	if r.ports.Members == nil {
		return map[string]any{"items": []MemberItem{}}, nil
	}
	var c teamConfig
	_ = json.Unmarshal(config, &c)
	items, err := r.ports.Members.ListMembers(ctx, MembersQuery{
		Locale: locale, Limit: clampLimit(c.Limit, 12)})
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []MemberItem{}
	}
	return map[string]any{"items": items}, nil
}

func (r *Resolver) resolveArticlesList(ctx context.Context, config json.RawMessage, locale string) (any, error) {
	if r.ports.Articles == nil {
		return map[string]any{"items": []ArticleItem{}}, nil
	}
	var c articlesListConfig
	_ = json.Unmarshal(config, &c) // intentional: config is valid JSON (sanitized at write); a shape mismatch falls back to zero-value defaults below
	items, err := r.ports.Articles.ListArticles(ctx, ArticlesQuery{
		Locale:     locale,
		CategoryID: c.Filters.CategoryID, Tag: c.Filters.Tag, Limit: clampLimit(c.Limit, 6),
	})
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []ArticleItem{}
	}
	return map[string]any{"items": items}, nil
}

type categoriesShowcaseConfig struct {
	Limit int `json:"limit"`
}

func (r *Resolver) resolveCategoriesShowcase(ctx context.Context, config json.RawMessage, locale string) (any, error) {
	if r.ports.Categories == nil {
		return map[string]any{"items": []CategoryItem{}}, nil
	}
	var c categoriesShowcaseConfig
	_ = json.Unmarshal(config, &c) // intentional: config is valid JSON (sanitized at write); a shape mismatch falls back to zero-value defaults below
	items, err := r.ports.Categories.ListCategories(ctx, CategoriesQuery{
		Locale: locale, Limit: clampLimit(c.Limit, 12)})
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []CategoryItem{}
	}
	return map[string]any{"items": items}, nil
}
