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
