// Package settings implements system-wide key-value configuration. The set of
// valid keys, their types, defaults, and flags live in a code REGISTRY (single
// source of truth, like the permission catalog) — the DB table only stores
// values. See docs/domains/settings/.
package settings

import (
	"encoding/json"
	"net/mail"
	"net/url"
	"strings"
)

// SettingType is the value type of a setting key.
type SettingType string

// Supported setting value types.
const (
	TypeString SettingType = "string"
	TypeInt    SettingType = "int"
	TypeBool   SettingType = "bool"
	TypeJSON   SettingType = "json"
	TypeSecret SettingType = "secret"
	TypeEnum   SettingType = "enum"
)

// Setting groups.
const (
	GroupGeneral  = "general"
	GroupCache    = "cache"
	GroupEmail    = "email"
	GroupStorage  = "storage"
	GroupSecurity = "security"
)

// reCAPTCHA keys. Declared here rather than in a feature module because more
// than one surface needs protecting (the contact form today, the public chat
// next) and none of them owns the credential.
const (
	RecaptchaEnabled = "security.recaptcha_enabled"
	RecaptchaSiteKey = "security.recaptcha_site_key"
	RecaptchaSecret  = "security.recaptcha_secret"
)

// SettingDef is the registry metadata for one key. The DB never stores any of
// this — only the value.
// The cache knobs this package owns. The third one — how long the public site
// may serve a rendered page — belongs to the CMS module that reads it, and
// joins them in GroupCache from there.
const (
	CacheConsoleRefresh = "cache.console_refresh_seconds"
	CachePublicMaxAge   = "cache.public_max_age_seconds"
	// purgeMarker is written by a cache purge and read by nobody. It is not in
	// the registry, so it never appears in a view; its only job is to move
	// system_settings' MAX(updated_at), which is part of the token the public
	// site polls — moving it is what makes the site drop its rendered pages.
	purgeMarker = "cache.purged_at"
)

type SettingDef struct {
	Key           string
	Group         string
	Type          SettingType
	AllowedValues []string // enum only
	Format        string   // string only: "url" | "email"
	Default       any      // nil for secrets
	Min, Max      *int     // int only
	IsPublic      bool     // readable without auth
	IsSecret      bool     // encrypted at rest, write-only
	Description   string
}

// Registry is an ordered catalog of setting definitions with O(1) lookup.
type Registry struct {
	order  []string
	defs   map[string]SettingDef
	groups []string
}

func intp(v int) *int { return &v }

// DefaultRegistry returns the foundation registry (general/email/storage).
// Business modules (e.g. CMS) extend it via NewRegistry with extra defs.
func DefaultRegistry() *Registry {
	return NewRegistry(foundationDefs()...)
}

// FoundationDefs returns the built-in foundation setting definitions. Business
// modules append their own defs and build a combined registry via NewRegistry
// (e.g. settings.NewRegistry(append(settings.FoundationDefs(), cms.SettingDefs()...)...)).
func FoundationDefs() []SettingDef {
	return foundationDefs()
}

func foundationDefs() []SettingDef {
	return []SettingDef{
		{Key: "app.name", Group: GroupGeneral, Type: TypeString, Default: "Zukatek", IsPublic: true, Description: "Application name"},
		{Key: "app.logo_url", Group: GroupGeneral, Type: TypeString, Format: "url_or_path", Default: "", IsPublic: true, Description: "Logo URL (console and public site)"},
		{Key: "app.favicon_url", Group: GroupGeneral, Type: TypeString, Format: "url_or_path", Default: "", IsPublic: true, Description: "Favicon URL; empty = the icon the site ships with"},
		{Key: "app.primary_color", Group: GroupGeneral, Type: TypeString, Format: "color", Default: "", IsPublic: true, Description: "Brand primary color (#RRGGBB); empty = theme default"},
		{Key: "app.default_locale", Group: GroupGeneral, Type: TypeEnum, AllowedValues: []string{"vi", "en"}, Default: "vi", IsPublic: true, Description: "Default locale"},
		{Key: "app.language_switcher_enabled", Group: GroupGeneral, Type: TypeBool, Default: true, IsPublic: true, Description: "Show the UI language switcher"},
		// How the console's own list tables page. Public because the console
		// reads them from /public/settings on first paint, beside the branding
		// it already reads there — a second, authenticated call would only
		// delay every list by one round trip. The max matches the cap every
		// admin list endpoint already clamps to.
		{Key: "app.page_size", Group: GroupGeneral, Type: TypeInt, Default: 10, Min: intp(2), Max: intp(100), IsPublic: true, Description: "Rows per page in the console's list tables"},
		{Key: "app.pagination_template", Group: GroupGeneral, Type: TypeEnum, AllowedValues: []string{"numbered", "prev_next", "load_more", "infinite"}, Default: "numbered", IsPublic: true, Description: "How those tables offer the next rows: numbered pages, prev/next only, a Load more button, or on scroll"},

		// What is allowed to go stale, and for how long. The site's own page TTL
		// (site.cache_ttl_seconds) joins these in the same group; it is declared
		// with the rest of the CMS keys because that is the module that reads it.
		{Key: CacheConsoleRefresh, Group: GroupCache, Type: TypeInt, Default: 60, Min: intp(0), Max: intp(3600), IsPublic: true, Description: "Seconds between a console tab re-reading this configuration; 0 = only when the page is reloaded"},
		{Key: CachePublicMaxAge, Group: GroupCache, Type: TypeInt, Default: 60, Min: intp(0), Max: intp(86400), IsPublic: true, Description: "Seconds a browser or CDN may cache the public settings response; 0 = no caching"},

		{Key: "mail.smtp_host", Group: GroupEmail, Type: TypeString, Default: "", Description: "SMTP server host"},
		{Key: "mail.smtp_port", Group: GroupEmail, Type: TypeInt, Default: 587, Min: intp(1), Max: intp(65535), Description: "SMTP server port"},
		{Key: "mail.smtp_user", Group: GroupEmail, Type: TypeString, Default: "", Description: "SMTP username"},
		{Key: "mail.smtp_password", Group: GroupEmail, Type: TypeSecret, IsSecret: true, Description: "SMTP password"},
		{Key: "mail.from_address", Group: GroupEmail, Type: TypeString, Format: "email", Default: "", Description: "Default From address"},
		{Key: "mail.from_name", Group: GroupEmail, Type: TypeString, Default: "", Description: "Name shown beside the From address"},

		{Key: "storage.driver", Group: GroupStorage, Type: TypeEnum, AllowedValues: []string{"local", "s3"}, Default: "local", Description: "Storage driver"},
		{Key: "storage.s3_bucket", Group: GroupStorage, Type: TypeString, Default: "", Description: "S3 bucket"},
		{Key: "storage.s3_region", Group: GroupStorage, Type: TypeString, Default: "", Description: "S3 region"},
		{Key: "storage.s3_endpoint", Group: GroupStorage, Type: TypeString, Format: "url", Default: "", Description: "S3 endpoint"},
		{Key: "storage.s3_access_key", Group: GroupStorage, Type: TypeString, Default: "", Description: "S3 access key"},
		{Key: "storage.s3_secret", Group: GroupStorage, Type: TypeSecret, IsSecret: true, Description: "S3 secret key"},
		{Key: "storage.max_upload_mb", Group: GroupStorage, Type: TypeInt, Default: 10, Min: intp(1), Max: intp(100), Description: "Max upload size (MB)"},
		{Key: "files_storage_quota_mb", Group: GroupStorage, Type: TypeInt, Default: 100, Min: intp(1), Max: intp(10000), Description: "Per-customer private storage quota (My Drive), in MB"},
		{Key: "files_max_upload_mb", Group: GroupStorage, Type: TypeInt, Default: 50, Min: intp(1), Max: intp(2000), Description: "Max size of a single My Drive file (upload/import), in MB"},

		// The site key is PUBLIC on purpose: the browser cannot render the
		// widget without it, so it is served with the rest of the public
		// settings. The secret is what must never leave the server — it is the
		// half that proves a token is genuine, and anyone holding it can mint
		// their own verdicts.
		{Key: RecaptchaEnabled, Group: GroupSecurity, Type: TypeBool, Default: false, IsPublic: true, Description: "Require reCAPTCHA on the public contact form"},
		{Key: RecaptchaSiteKey, Group: GroupSecurity, Type: TypeString, Default: "", IsPublic: true, Description: "reCAPTCHA v2 site key (public; the browser needs it)"},
		{Key: RecaptchaSecret, Group: GroupSecurity, Type: TypeSecret, IsSecret: true, Description: "reCAPTCHA v2 secret key (server-side verification only)"},
	}
}

// NewRegistry builds a registry preserving declaration order. Panics on a
// duplicate key or an invalid def (programmer error caught at startup).
func NewRegistry(defs ...SettingDef) *Registry {
	r := &Registry{defs: make(map[string]SettingDef, len(defs))}
	seenGroup := map[string]bool{}
	for _, d := range defs {
		if _, dup := r.defs[d.Key]; dup {
			panic("settings: duplicate registry key " + d.Key)
		}
		if d.IsPublic && d.IsSecret {
			panic("settings: key cannot be both public and secret: " + d.Key)
		}
		r.defs[d.Key] = d
		r.order = append(r.order, d.Key)
		if !seenGroup[d.Group] {
			seenGroup[d.Group] = true
			r.groups = append(r.groups, d.Group)
		}
	}
	return r
}

// Get returns the definition for a key.
func (r *Registry) Get(key string) (SettingDef, bool) {
	d, ok := r.defs[key]
	return d, ok
}

// Keys returns all registry keys in declaration order.
func (r *Registry) Keys() []string { return r.order }

// Groups returns group names in first-seen order.
func (r *Registry) Groups() []string { return r.groups }

// validate checks a raw JSON value against the def's type/constraints and
// returns the normalized Go value, or a reason key on failure.
func (d SettingDef) validate(raw json.RawMessage) (any, string) {
	switch d.Type {
	case TypeBool:
		var b bool
		if json.Unmarshal(raw, &b) != nil {
			return nil, "invalid_type"
		}
		return b, ""
	case TypeInt:
		var f float64
		if json.Unmarshal(raw, &f) != nil || f != float64(int(f)) {
			return nil, "invalid_type"
		}
		n := int(f)
		if (d.Min != nil && n < *d.Min) || (d.Max != nil && n > *d.Max) {
			return nil, "out_of_range"
		}
		return n, ""
	case TypeString, TypeSecret:
		var s string
		if json.Unmarshal(raw, &s) != nil {
			return nil, "invalid_type"
		}
		if reason := validateFormat(d.Format, s); reason != "" {
			return nil, reason
		}
		return s, ""
	case TypeEnum:
		var s string
		if json.Unmarshal(raw, &s) != nil {
			return nil, "invalid_type"
		}
		for _, v := range d.AllowedValues {
			if v == s {
				return s, ""
			}
		}
		return nil, "invalid_value"
	case TypeJSON:
		if !json.Valid(raw) {
			return nil, "invalid_type"
		}
		var v any
		_ = json.Unmarshal(raw, &v)
		return v, ""
	default:
		return nil, "invalid_type"
	}
}

// validateFormat applies an optional string format. An empty string always
// passes (means "unset"); only non-empty values are format-checked.
func validateFormat(format, s string) string {
	if s == "" || format == "" {
		return ""
	}
	switch format {
	case "url":
		if !isAbsoluteURL(s) {
			return "invalid_url"
		}
	// An image this site serves itself is written "/assets/logo.png", and
	// requiring a scheme for it would make the obvious case the invalid one.
	// A protocol-relative "//host/x" is not a path: it leaves the site.
	case "url_or_path":
		if strings.HasPrefix(s, "//") {
			return "invalid_url"
		}
		if !strings.HasPrefix(s, "/") && !isAbsoluteURL(s) {
			return "invalid_url"
		}
	case "email":
		if _, err := mail.ParseAddress(s); err != nil {
			return "invalid_email"
		}
	case "color":
		if !isHexColor(s) {
			return "invalid_color"
		}
	}
	return ""
}

// isHexColor reports whether s is a `#RRGGBB` color literal (the form the
// console color picker emits and the theme applier consumes).
func isHexColor(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	for _, c := range s[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// isAbsoluteURL reports whether s is an http(s) address with a host.
func isAbsoluteURL(s string) bool {
	u, err := url.ParseRequestURI(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}
