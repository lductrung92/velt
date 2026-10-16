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

func TestBody_KeepsImageSizeAndAlignment(t *testing.T) {
	for _, class := range []string{"kd-img--left", "kd-img--center", "kd-img--right"} {
		in := `<img src="https://ok.example/a.png" alt="a" width="50%" class="` + class + `">`
		for _, policy := range []func(string) string{Body, BodyWithWidgets} {
			out := policy(in)
			for _, want := range []string{`src="https://ok.example/a.png"`, `alt="a"`, `width="50%"`, `class="` + class + `"`} {
				if !strings.Contains(out, want) {
					t.Errorf("dropped %q from %q -> %q", want, in, out)
				}
			}
		}
	}
	px := Body(`<img src="https://ok.example/a.png" width="320">`)
	if !strings.Contains(px, `width="320"`) {
		t.Errorf("Body dropped a pixel width: %q", px)
	}

	// A width class, and the pair an image usually carries: how wide, and where.
	// The real pixel size rides along in width/height so the page does not jump.
	for _, class := range []string{
		"kd-img--w25", "kd-img--w50", "kd-img--w75", "kd-img--w100",
		"kd-img--w50 kd-img--center", "kd-img--center kd-img--w50",
	} {
		in := `<img src="https://ok.example/a.png" width="1338" height="752" class="` + class + `">`
		for _, policy := range []func(string) string{Body, BodyWithWidgets} {
			out := policy(in)
			for _, want := range []string{`class="` + class + `"`, `width="1338"`, `height="752"`} {
				if !strings.Contains(out, want) {
					t.Errorf("dropped %q from %q -> %q", want, in, out)
				}
			}
		}
	}
}

func TestBody_StripsNearMissImageClasses(t *testing.T) {
	// One character off the allowlist is not on it, and a real class smuggled in
	// beside an invented one takes the whole attribute with it.
	for _, in := range []string{
		`<img src="https://ok.example/a.png" class="kd-img--w60">`,
		`<img src="https://ok.example/a.png" class="kd-img--w50x">`,
		`<img src="https://ok.example/a.png" class="kd-img--w50 evil">`,
		`<img src="https://ok.example/a.png" class="kd-img--w50  kd-img--center">`,
		`<p class="kd-img--w50">x</p>`,
	} {
		for _, policy := range []func(string) string{Body, BodyWithWidgets} {
			if out := policy(in); strings.Contains(out, "class=") {
				t.Errorf("kept a disallowed class in %q -> %q", in, out)
			}
		}
	}
}

func TestBody_KeepsTextAlignment(t *testing.T) {
	cases := []string{
		`<p class="kd-text--center">x</p>`,
		`<h2 class="kd-text--right">x</h2>`,
	}
	for _, in := range cases {
		for _, policy := range []func(string) string{Body, BodyWithWidgets} {
			out := policy(in)
			if out != in {
				t.Errorf("dropped text alignment from %q -> %q", in, out)
			}
		}
	}
}

func TestBody_StripsOtherClassesAndStyle(t *testing.T) {
	cases := []string{
		`<img src="https://ok.example/a.png" class="anything-else">`,
		`<img src="https://ok.example/a.png" class="kd-img--center evil">`,
		`<img src="https://ok.example/a.png" style="position:fixed;inset:0">`,
		`<p class="kd-img--center">x</p>`,
		`<p class="kd-text--left">x</p>`,
		`<p class="kd-text--center x">x</p>`,
		`<p class="anything">x</p>`,
		`<div class="kd-text--center">x</div>`,
		`<li class="kd-text--center">x</li>`,
		`<blockquote class="kd-text--center">x</blockquote>`,
	}
	for _, in := range cases {
		for _, policy := range []func(string) string{Body, BodyWithWidgets} {
			out := policy(in)
			if strings.Contains(out, "class=") || strings.Contains(out, "style=") {
				t.Errorf("kept a disallowed attribute in %q -> %q", in, out)
			}
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
