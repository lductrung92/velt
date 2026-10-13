package settings

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRegistry_FoundationShape(t *testing.T) {
	r := DefaultRegistry()
	require.Equal(t, []string{"general", "email", "storage"}, r.Groups())

	pw, ok := r.Get("mail.smtp_password")
	require.True(t, ok)
	require.True(t, pw.IsSecret)
	require.False(t, pw.IsPublic)

	_, ok = r.Get("nope")
	require.False(t, ok)
}

func TestRegistry_PublicSecretConflictPanics(t *testing.T) {
	require.Panics(t, func() {
		NewRegistry(SettingDef{Key: "x", Group: "g", Type: TypeSecret, IsPublic: true, IsSecret: true})
	})
}

func TestRegistry_DuplicateKeyPanics(t *testing.T) {
	require.Panics(t, func() {
		NewRegistry(
			SettingDef{Key: "dup", Group: "g", Type: TypeString},
			SettingDef{Key: "dup", Group: "g", Type: TypeString},
		)
	})
}

func TestSettingDef_Validate(t *testing.T) {
	r := DefaultRegistry()
	get := func(k string) SettingDef { d, _ := r.Get(k); return d }

	cases := []struct {
		name    string
		def     SettingDef
		raw     string
		wantOK  bool
		wantKey string
	}{
		{"bool ok", SettingDef{Type: TypeBool}, `true`, true, ""},
		{"bool bad", SettingDef{Type: TypeBool}, `"x"`, false, "invalid_type"},
		{"int ok", get("mail.smtp_port"), `587`, true, ""},
		{"int non-integer", get("mail.smtp_port"), `1.5`, false, "invalid_type"},
		{"int out of range", get("mail.smtp_port"), `70000`, false, "out_of_range"},
		{"int under range", get("storage.max_upload_mb"), `0`, false, "out_of_range"},
		{"enum ok", get("app.default_locale"), `"en"`, true, ""},
		{"enum bad", get("app.default_locale"), `"fr"`, false, "invalid_value"},
		{"string ok", get("app.name"), `"hi"`, true, ""},
		{"url empty ok", get("app.logo_url"), `""`, true, ""},
		{"url ok", get("app.logo_url"), `"https://x.test/a.png"`, true, ""},
		{"url bad", get("app.logo_url"), `"ftp://x"`, false, "invalid_url"},
		{"email ok", get("mail.from_address"), `"a@b.com"`, true, ""},
		{"email bad", get("mail.from_address"), `"nope"`, false, "invalid_email"},
		{"color empty ok", get("app.primary_color"), `""`, true, ""},
		{"color ok", get("app.primary_color"), `"#0F172A"`, true, ""},
		{"color no hash", get("app.primary_color"), `"0f172a"`, false, "invalid_color"},
		{"color short", get("app.primary_color"), `"#fff"`, false, "invalid_color"},
		{"color non-hex", get("app.primary_color"), `"#zzzzzz"`, false, "invalid_color"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, reason := c.def.validate(json.RawMessage(c.raw))
			if c.wantOK {
				require.Empty(t, reason)
			} else {
				require.Equal(t, c.wantKey, reason)
			}
		})
	}
}

// An image the site hosts itself is written as a path, and that is the common
// case: logo, favicon and the sharing image all normally live under /assets.
// Requiring a scheme made the obvious value the invalid one.
func TestValidateFormat_URLOrPath(t *testing.T) {
	for _, ok := range []string{
		"/assets/logo.png",
		"/assets/logo.png?v=2",
		"https://cdn.example.com/logo.png",
		"http://example.com/a",
		"", // unset
	} {
		require.Empty(t, validateFormat("url_or_path", ok), ok)
	}
	for _, bad := range []string{
		"//evil.example.com/logo.png", // protocol-relative: leaves the site
		"javascript:alert(1)",
		"assets/logo.png", // neither a path nor an address
		"ftp://example.com/a",
	} {
		require.Equal(t, "invalid_url", validateFormat("url_or_path", bad), bad)
	}
	// The strict format is unchanged: a social profile is always absolute.
	require.Equal(t, "invalid_url", validateFormat("url", "/assets/logo.png"))
	require.Empty(t, validateFormat("url", "https://facebook.com/zukatek"))
}
