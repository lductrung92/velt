// Package htmlsan sanitizes admin/editor-authored rich-text HTML before it is
// stored and later rendered on the public web. Sanitizing server-side (not
// trusting the client) is the XSS defense for CMS body_html
// (docs/domains/cms/security-performance.md): allowlist tags/attrs, strip
// <script> + on* handlers, and only permit http/https/mailto URLs (no
// data:/javascript:). Built on bluemonday's vetted policies.
package htmlsan

import (
	"regexp"

	"github.com/microcosm-cc/bluemonday"
)

// bodyPolicy is bluemonday's UGC allowlist: common formatting (p, headings,
// lists, blockquote, code/pre, tables), links and images on http/https/mailto
// only. It drops <script>, inline event handlers, <style>, <iframe>, <svg> and
// data:/javascript: URLs. Policies are safe for concurrent Sanitize use, so we
// build it once at package init.
var bodyPolicy = bluemonday.UGCPolicy()

// Body sanitizes page/article body HTML to the allowlist above. Embeds (iframe)
// are intentionally NOT allowed here — they are a landing-only concern with a
// host whitelist (youtube/vimeo), handled separately.
func Body(html string) string {
	if html == "" {
		return ""
	}
	return bodyPolicy.Sanitize(html)
}

// bodyWidgetsPolicy is the body allowlist plus the inline-widget placeholder:
// an empty `<div data-kd-widget="<id>">` that the public web swaps for a rendered
// widget. Only that one data attribute is allowed (no config travels in the HTML —
// it lives in body_json and is resolved server-side), so this adds no XSS surface.
var bodyWidgetsPolicy = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowElements("div")
	p.AllowAttrs("data-kd-widget").OnElements("div")
	return p
}()

// BodyWithWidgets sanitizes page body HTML that may contain inline-widget
// placeholders (the body allowlist + `div[data-kd-widget]`). Used for CMS pages;
// article body stays on the stricter Body (no widgets).
func BodyWithWidgets(html string) string {
	if html == "" {
		return ""
	}
	return bodyWidgetsPolicy.Sanitize(html)
}

// strictPolicy strips ALL HTML, leaving plain text (used for SEO/OG fields that
// must never carry markup when injected into <meta>/<title>).
var strictPolicy = bluemonday.StrictPolicy()

// PlainText removes every HTML tag, returning the text content only. For
// short metadata fields (SEO title/description, OG tags) so a stored value can
// never inject markup wherever the web tier renders it.
func PlainText(s string) string {
	if s == "" {
		return ""
	}
	return strictPolicy.Sanitize(s)
}

// embedSrcPattern is the iframe host whitelist for landing html_embed sections
// (docs/domains/cms/landing.md §html_embed): YouTube + Vimeo player only.
var embedSrcPattern = regexp.MustCompile(`(?i)^https://(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)/`)

// embedPolicy extends the UGC allowlist with <iframe> restricted to the embed
// host whitelist (non-matching src is stripped → no arbitrary frames). Used only
// for landing html_embed; everything else stays on Body.
var embedPolicy = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowElements("iframe")
	p.AllowAttrs("width", "height", "frameborder", "allow", "allowfullscreen", "loading", "title").OnElements("iframe")
	p.AllowAttrs("src").Matching(embedSrcPattern).OnElements("iframe")
	return p
}()

// Embed sanitizes landing html_embed HTML: the Body allowlist plus iframes whose
// src matches the YouTube/Vimeo whitelist (other hosts → src stripped).
func Embed(html string) string {
	if html == "" {
		return ""
	}
	return embedPolicy.Sanitize(html)
}
