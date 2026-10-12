package translation

import (
	"context"
	"strings"

	"github.com/velt/backend/internal/modules/settings"
)

// Settings keys for the translation module, mirroring the `ai.*` shape: a single
// enable flag the feature hides behind, plus its configuration.
const (
	GroupTranslation = "translation"

	KeyEnabled = "translation.enabled"
	KeyLocales = "translation.locales"
)

// BaseLocale is the source language. It always lives in the content table's own
// columns and is never a row in `translations`.
const BaseLocale = "vi"

// SettingDefs are the translation module's entries in the settings registry.
//
// `locales` is a comma-separated string rather than a JSON array: the settings
// store has a json type, but every reader of this value wants a []string and a
// comma list keeps the settings screen a plain text box.
func SettingDefs() []settings.SettingDef {
	return []settings.SettingDef{
		{Key: KeyEnabled, Group: GroupTranslation, Type: settings.TypeBool, Default: false, IsPublic: true,
			Description: "Turn content translation on. Off → everything serves Vietnamese, and saved translations are kept"},
		{Key: KeyLocales, Group: GroupTranslation, Type: settings.TypeString, Default: "en", IsPublic: true,
			Description: "Languages besides Vietnamese, comma-separated (e.g. en,ja)"},
	}
}

// SettingsPort is the slice of the settings service this module reads. Both
// values are cached there, so these are not database round-trips.
type SettingsPort interface {
	GetBool(ctx context.Context, key string) bool
	GetString(ctx context.Context, key string) string
}

// Config is the module's effective configuration at one moment.
type Config struct {
	Enabled bool
	Locales []string
}

// Allows reports whether a locale may be written or served. The base locale is
// never one of them: it is not a translation.
func (c Config) Allows(locale string) bool {
	for _, l := range c.Locales {
		if l == locale {
			return true
		}
	}
	return false
}

func readConfig(ctx context.Context, p SettingsPort) Config {
	if p == nil {
		return Config{}
	}
	c := Config{Enabled: p.GetBool(ctx, KeyEnabled)}
	for _, raw := range strings.Split(p.GetString(ctx, KeyLocales), ",") {
		l := strings.ToLower(strings.TrimSpace(raw))
		if l != "" && l != BaseLocale {
			c.Locales = append(c.Locales, l)
		}
	}
	return c
}
