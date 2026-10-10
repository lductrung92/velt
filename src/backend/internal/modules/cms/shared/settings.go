package shared

import (
	"context"
	"encoding/json"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/settings"
)

// GroupCMS is the settings-registry group the CMS feature flags live under (they
// share the system_settings store; there is no cms_settings table). KeyPrefixCMS
// bounds which keys /api/cms/settings may write.
const (
	GroupCMS     = "cms"
	KeyPrefixCMS = "cms."
)

// CMS feature-flag keys (registered in the settings registry, group "cms").
const (
	FlagArticleCategorize    = "cms.article.categorize"
	FlagArticleAllowSlugEdit = "cms.article.allow_slug_edit"
	FlagArticleRequireReview = "cms.article.require_review"
	FlagNewsletterNotify     = "cms.newsletter.notify_on_publish"
	FlagPublishAllowNow      = "cms.publish.allow_now"
	// HomePageSlug is the slug of the published CMS page served as the public
	// homepage ("/"). Empty → the web falls back to its built-in home. Public so
	// the web tier can read it from /api/public/settings without auth.
	HomePageSlug = "cms.home_page_slug"
)

// SettingsPort is the scoped reader/writer for the cms.* feature flags. It is
// satisfied by the settings service (Redis-cached).
type SettingsPort interface {
	GroupView(ctx context.Context, group string) (settings.GroupedView, error)
	UpdateScoped(ctx context.Context, id *httpx.Identity, updates map[string]json.RawMessage, allowPrefix string) (settings.GroupedView, error)
	GetInt(ctx context.Context, key string) int
}

// SettingDefs returns the CMS feature-flag definitions to merge into the settings
// registry at startup (booleans, not public, read via the cached settings
// service). Writes are gated by cms.settings.*, not settings.manage.
//
// The console no longer routes a CMS settings screen, so in practice these
// defaults ARE the live values: nothing writes a system_settings row for them
// unless someone calls PUT /api/cms/settings directly. Change a default here to
// change the product behaviour.
func SettingDefs() []settings.SettingDef {
	return []settings.SettingDef{
		{Key: FlagArticleCategorize, Group: GroupCMS, Type: settings.TypeBool, Default: false, Description: "Require choosing a category when creating an article"},
		{Key: FlagArticleAllowSlugEdit, Group: GroupCMS, Type: settings.TypeBool, Default: true, Description: "Allow manual slug editing (else auto-suffix on collision)"},
		{Key: FlagArticleRequireReview, Group: GroupCMS, Type: settings.TypeBool, Default: false, Description: "Require admin review before an editor's article is published"},
		{Key: FlagNewsletterNotify, Group: GroupCMS, Type: settings.TypeBool, Default: false, Description: "Email newsletter subscribers when an article is published"},
		{Key: FlagPublishAllowNow, Group: GroupCMS, Type: settings.TypeBool, Default: true, Description: "ON: only immediate publish (hide scheduling); OFF: also offer scheduled publish"},
		{Key: HomePageSlug, Group: GroupCMS, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Slug of the published CMS page served as the public homepage; empty → built-in home"},
	}
}
