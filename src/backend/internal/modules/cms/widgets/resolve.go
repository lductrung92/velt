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
	Limit int
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
	switch typ {
	case TypeGamesList:
		return r.resolveGamesList(ctx, config)
	case TypeArticlesList:
		return r.resolveArticlesList(ctx, config)
	case TypeCategoriesShowcase:
		return r.resolveCategoriesShowcase(ctx, config)
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

func (r *Resolver) resolveGamesList(ctx context.Context, config json.RawMessage) (any, error) {
	if r.ports.Games == nil {
		return map[string]any{"items": []GameItem{}}, nil
	}
	var c gamesListConfig
	_ = json.Unmarshal(config, &c) // intentional: config is valid JSON (sanitized at write); a shape mismatch falls back to zero-value defaults below
	items, err := r.ports.Games.ListGames(ctx, GamesQuery{
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

func (r *Resolver) resolveArticlesList(ctx context.Context, config json.RawMessage) (any, error) {
	if r.ports.Articles == nil {
		return map[string]any{"items": []ArticleItem{}}, nil
	}
	var c articlesListConfig
	_ = json.Unmarshal(config, &c) // intentional: config is valid JSON (sanitized at write); a shape mismatch falls back to zero-value defaults below
	items, err := r.ports.Articles.ListArticles(ctx, ArticlesQuery{
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

func (r *Resolver) resolveCategoriesShowcase(ctx context.Context, config json.RawMessage) (any, error) {
	if r.ports.Categories == nil {
		return map[string]any{"items": []CategoryItem{}}, nil
	}
	var c categoriesShowcaseConfig
	_ = json.Unmarshal(config, &c) // intentional: config is valid JSON (sanitized at write); a shape mismatch falls back to zero-value defaults below
	items, err := r.ports.Categories.ListCategories(ctx, CategoriesQuery{Limit: clampLimit(c.Limit, 12)})
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []CategoryItem{}
	}
	return map[string]any{"items": items}, nil
}
