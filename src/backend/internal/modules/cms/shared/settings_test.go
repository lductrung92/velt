package shared_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/settings"
)

// The homepage-slug setting is consumed by the public web tier, so it MUST be a
// public, non-secret string with an empty default (empty → built-in home). Lock
// that invariant + confirm the whole cms def set builds into the registry.
func TestSettingDefs_HomePageSlug(t *testing.T) {
	var def settings.SettingDef
	var found bool
	for _, d := range shared.SettingDefs() {
		if d.Key == shared.HomePageSlug {
			def, found = d, true
		}
	}
	require.True(t, found, "cms.home_page_slug must be registered")
	require.Equal(t, settings.TypeString, def.Type)
	require.True(t, def.IsPublic, "web reads it via /public/settings")
	require.False(t, def.IsSecret)
	require.Equal(t, "", def.Default)
	require.Equal(t, shared.GroupCMS, def.Group)

	// Building a registry from the cms defs must not panic (no duplicate key /
	// no public+secret conflict).
	require.NotPanics(t, func() { settings.NewRegistry(shared.SettingDefs()...) })
}
