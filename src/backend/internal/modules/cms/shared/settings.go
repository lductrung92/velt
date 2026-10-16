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
	GroupCMS = "cms"
	// GroupSite holds what the public site renders outside its content: how
	// long it may cache, the words around the navigation, how to reach the
	// company, and how many cards fit on a page. GroupSEO holds what it tells
	// search engines. They are their own groups because the settings screen is
	// grouped, and "cms" is about editing, not about the site.
	GroupSite = "site"
	GroupSEO  = "seo"
	// GroupTranslation is the translation module's own group, read (and written)
	// by the CMS settings screen because that is where the language list belongs.
	GroupTranslation = "translation"
	KeyPrefixCMS     = "cms."
	// KeyPrefixSite bounds the site.* keys: what the public site renders
	// outside the content itself (cache TTL, header/footer copy). They live in
	// the same group and the same screen as the CMS flags, and are written
	// under the same cms.settings.manage permission, so the scoped writer must
	// accept this prefix too — without it site.* keys are readable and
	// unwritable, which is how the cache TTL shipped uneditable.
	KeyPrefixSite = "site."
	// KeyPrefixTranslation bounds the two keys that decide which languages the
	// site offers. They belong to the translation module, but the only screen
	// that could sensibly carry them is this one — the alternative is editing
	// the database by hand to add a language, which is how it worked until now.
	KeyPrefixTranslation = "translation."
	KeyPrefixSEO         = "seo."
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

	// SiteCacheTTL — how long the public site may serve a rendered page from
	// its own cache before asking again. Public so the web tier reads it
	// without auth; 0 disables caching, which is what you want while editing.
	SiteCacheTTL = "site.cache_ttl_seconds"

	// The site's chrome: the text around the navigation, which has no content
	// record to live in. Links come from the menu builder (cms_menus); these
	// are the words beside them.
	//
	// Every one defaults to "" and "" means "use the copy the site ships
	// with" — the same contract the landing sections use, so the words have
	// one home (the site's own components) instead of two that can disagree.
	SiteOGImageURL      = "site.og_image_url"
	SiteBrandTagline    = "site.brand_tagline"
	SiteFooterNoteTitle = "site.footer_note_title"
	SiteFooterNoteText  = "site.footer_note_text"
	SiteFooterCopyright = "site.footer_copyright"
	SiteHeaderCTALabel  = "site.header_cta_label"
	SiteHeaderCTAURL    = "site.header_cta_url"

	// How to reach the company. Until these existed the public contact block
	// had no address of its own: it could only offer the member a visitor
	// happened to arrive through, and otherwise said the channel was coming.
	SiteContactEmail = "site.contact_email"
	SiteContactZalo  = "site.contact_zalo"
	SiteContactPhone = "site.contact_phone"
	SiteAddress      = "site.address"

	// Social profiles. Each one is rendered only when it is filled, so an empty
	// list leaves the footer exactly as it is.
	SiteSocialFacebook = "site.social_facebook"
	SiteSocialLinkedIn = "site.social_linkedin"
	SiteSocialYouTube  = "site.social_youtube"
	SiteSocialGitHub   = "site.social_github"

	// How many cards a listing page shows.
	SiteBlogPageSize     = "site.blog_page_size"
	SiteProductsPageSize = "site.products_page_size"

	// What the site tells search engines.
	SEONoindexAll   = "seo.noindex_all"
	SEOVerification = "seo.google_site_verification"
	SEOAnalyticsID  = "seo.analytics_id"
)

// SettingsPort is the scoped reader/writer for the cms.* feature flags. It is
// satisfied by the settings service (Redis-cached).
type SettingsPort interface {
	GroupView(ctx context.Context, group string) (settings.GroupedView, error)
	UpdateScoped(ctx context.Context, id *httpx.Identity, updates map[string]json.RawMessage, allowPrefixes ...string) (settings.GroupedView, error)
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
		// Shown with the other cache knobs, not with the site's copy: it is the
		// same question as theirs. The KEY is unchanged, so every stored value
		// and every reader stays as it was.
		{Key: SiteCacheTTL, Group: settings.GroupCache, Type: settings.TypeInt, Default: 60, Min: ptr(0), Max: ptr(86400), IsPublic: true, Description: "Seconds the public site may serve a cached page; 0 disables caching"},
		{Key: SiteOGImageURL, Group: GroupSite, Type: settings.TypeString, Format: "url_or_path", Default: "", IsPublic: true, Description: "Image shown when a page is shared; empty → no image unless the content has one"},
		{Key: SiteBrandTagline, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Footer line under the logo (newlines kept); empty → the site's built-in copy"},
		{Key: SiteFooterNoteTitle, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Heading of the footer's last column; empty → the site's built-in copy"},
		{Key: SiteFooterNoteText, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Body of the footer's last column (newlines kept); empty → the site's built-in copy"},
		{Key: SiteFooterCopyright, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Copyright line; {year} is replaced by the current year. Empty → the site's built-in copy"},
		{Key: SiteHeaderCTALabel, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Label of the header's contact button; empty → the site's built-in copy"},
		{Key: SiteHeaderCTAURL, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Target of the header's contact button (a path or URL); empty → the site's built-in target"},

		{Key: SiteContactEmail, Group: GroupSite, Type: settings.TypeString, Format: "email", Default: "", IsPublic: true, Description: "The company's own contact address, shown when no member is in play"},
		{Key: SiteContactZalo, Group: GroupSite, Type: settings.TypeString, Format: "url", Default: "", IsPublic: true, Description: "Zalo link for the same block"},
		{Key: SiteContactPhone, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Phone number shown in the footer; empty → not shown"},
		{Key: SiteAddress, Group: GroupSite, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Address shown in the footer; empty → not shown"},

		{Key: SiteSocialFacebook, Group: GroupSite, Type: settings.TypeString, Format: "url", Default: "", IsPublic: true, Description: "Facebook profile; empty → no icon"},
		{Key: SiteSocialLinkedIn, Group: GroupSite, Type: settings.TypeString, Format: "url", Default: "", IsPublic: true, Description: "LinkedIn profile; empty → no icon"},
		{Key: SiteSocialYouTube, Group: GroupSite, Type: settings.TypeString, Format: "url", Default: "", IsPublic: true, Description: "YouTube channel; empty → no icon"},
		{Key: SiteSocialGitHub, Group: GroupSite, Type: settings.TypeString, Format: "url", Default: "", IsPublic: true, Description: "GitHub profile; empty → no icon"},

		{Key: SiteBlogPageSize, Group: GroupSite, Type: settings.TypeInt, Default: 9, Min: ptr(3), Max: ptr(24), IsPublic: true, Description: "Articles per page on the blog"},
		{Key: SiteProductsPageSize, Group: GroupSite, Type: settings.TypeInt, Default: 9, Min: ptr(3), Max: ptr(48), IsPublic: true, Description: "Products per page in the catalogue"},

		{Key: SEONoindexAll, Group: GroupSEO, Type: settings.TypeBool, Default: false, IsPublic: true, Description: "Ask search engines to index nothing — for a site that is not launched yet"},
		{Key: SEOVerification, Group: GroupSEO, Type: settings.TypeString, Default: "", IsPublic: true, Description: "google-site-verification content value"},
		{Key: SEOAnalyticsID, Group: GroupSEO, Type: settings.TypeString, Default: "", IsPublic: true, Description: "Measurement id of the analytics script (GA4 G-XXXX, or a Plausible domain)"},
	}
}

// ptr is the local spelling of the settings package's unexported int pointer
// helper; a bounded int setting needs Min/Max as pointers.
func ptr(v int) *int { return &v }
