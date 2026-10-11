// Package settings implements system-wide key-value configuration. The set of
// valid keys, their types, defaults, and flags live in a code REGISTRY (single
// source of truth, like the permission catalog) — the DB table only stores
// values. See docs/domains/settings/.
package settings

import (
	"encoding/json"
	"net/mail"
	"net/url"
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
	GroupGeneral = "general"
	GroupEmail   = "email"
	GroupStorage = "storage"
)

// SettingDef is the registry metadata for one key. The DB never stores any of
// this — only the value.
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
		{Key: "app.logo_url", Group: GroupGeneral, Type: TypeString, Format: "url", Default: "", IsPublic: true, Description: "Logo URL"},
		{Key: "app.primary_color", Group: GroupGeneral, Type: TypeString, Format: "color", Default: "", IsPublic: true, Description: "Brand primary color (#RRGGBB); empty = theme default"},
		{Key: "app.default_locale", Group: GroupGeneral, Type: TypeEnum, AllowedValues: []string{"vi", "en"}, Default: "vi", IsPublic: true, Description: "Default locale"},
		{Key: "app.language_switcher_enabled", Group: GroupGeneral, Type: TypeBool, Default: true, IsPublic: true, Description: "Show the UI language switcher"},
		{Key: "app.maintenance_mode", Group: GroupGeneral, Type: TypeBool, Default: false, IsPublic: true, Description: "Maintenance mode — the public site serves a 503 maintenance page"},
		{Key: "app.maintenance_message", Group: GroupGeneral, Type: TypeString, Default: "", IsPublic: true, Description: "Message shown on the maintenance page (empty = default copy)"},

		{Key: "mail.smtp_host", Group: GroupEmail, Type: TypeString, Default: "", Description: "SMTP server host"},
		{Key: "mail.smtp_port", Group: GroupEmail, Type: TypeInt, Default: 587, Min: intp(1), Max: intp(65535), Description: "SMTP server port"},
		{Key: "mail.smtp_user", Group: GroupEmail, Type: TypeString, Default: "", Description: "SMTP username"},
		{Key: "mail.smtp_password", Group: GroupEmail, Type: TypeSecret, IsSecret: true, Description: "SMTP password"},
		{Key: "mail.from_address", Group: GroupEmail, Type: TypeString, Format: "email", Default: "", Description: "Default From address"},

		{Key: "storage.driver", Group: GroupStorage, Type: TypeEnum, AllowedValues: []string{"local", "s3"}, Default: "local", Description: "Storage driver"},
		{Key: "storage.s3_bucket", Group: GroupStorage, Type: TypeString, Default: "", Description: "S3 bucket"},
		{Key: "storage.s3_region", Group: GroupStorage, Type: TypeString, Default: "", Description: "S3 region"},
		{Key: "storage.s3_endpoint", Group: GroupStorage, Type: TypeString, Format: "url", Default: "", Description: "S3 endpoint"},
		{Key: "storage.s3_access_key", Group: GroupStorage, Type: TypeString, Default: "", Description: "S3 access key"},
		{Key: "storage.s3_secret", Group: GroupStorage, Type: TypeSecret, IsSecret: true, Description: "S3 secret key"},
		{Key: "storage.max_upload_mb", Group: GroupStorage, Type: TypeInt, Default: 10, Min: intp(1), Max: intp(100), Description: "Max upload size (MB)"},
		{Key: "files_storage_quota_mb", Group: GroupStorage, Type: TypeInt, Default: 100, Min: intp(1), Max: intp(10000), Description: "Per-customer private storage quota (My Drive), in MB"},
		{Key: "files_max_upload_mb", Group: GroupStorage, Type: TypeInt, Default: 50, Min: intp(1), Max: intp(2000), Description: "Max size of a single My Drive file (upload/import), in MB"},
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
		u, err := url.ParseRequestURI(s)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
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
