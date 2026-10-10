package htmlsan

import (
	"strings"
	"testing"
)

func TestBody_StripsScriptAndHandlers(t *testing.T) {
	cases := []string{
		`<script>alert(1)</script>`,
		`<img src=x onerror="alert(1)">`,
		`<a href="javascript:alert(1)">x</a>`,
		`<a href="data:text/html,<script>alert(1)</script>">x</a>`,
		`<iframe src="https://evil.example/x"></iframe>`,
		`<style>body{display:none}</style>`,
	}
	for _, in := range cases {
		out := Body(in)
		low := strings.ToLower(out)
		if strings.Contains(low, "<script") || strings.Contains(low, "onerror") ||
			strings.Contains(low, "javascript:") || strings.Contains(low, "<iframe") ||
			strings.Contains(low, "<style") {
			t.Errorf("Body did not sanitize %q -> %q", in, out)
		}
	}
}

func TestBody_KeepsSafeFormatting(t *testing.T) {
	out := Body(`<p>hello <strong>world</strong> <a href="https://ok.example">link</a></p>`)
	for _, want := range []string{"<p>", "<strong>", `href="https://ok.example"`} {
		if !strings.Contains(out, want) {
			t.Errorf("Body dropped safe markup %q from %q", want, out)
		}
	}
}

func TestEmbed_WhitelistsYouTubeVimeoOnly(t *testing.T) {
	yt := Embed(`<iframe src="https://www.youtube.com/embed/abc"></iframe>`)
	if !strings.Contains(yt, "youtube.com/embed/abc") {
		t.Errorf("Embed dropped a whitelisted YouTube iframe: %q", yt)
	}
	evil := Embed(`<iframe src="https://evil.example/x"></iframe>`)
	if strings.Contains(strings.ToLower(evil), "evil.example") {
		t.Errorf("Embed kept a non-whitelisted iframe src: %q", evil)
	}
}

func TestPlainText_StripsAllMarkup(t *testing.T) {
	out := PlainText(`<b>Hi</b><script>alert(1)</script> there`)
	if strings.Contains(out, "<") || strings.Contains(strings.ToLower(out), "script") {
		t.Errorf("PlainText left markup: %q", out)
	}
	if !strings.Contains(out, "Hi") || !strings.Contains(out, "there") {
		t.Errorf("PlainText dropped text content: %q", out)
	}
}
