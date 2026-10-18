package htmlsan

import (
	"regexp"
	"strings"

	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/net/html"
)

// Inline SVG in body HTML: diagrams drawn by the editor's SVG tool.
//
// WHY INLINE AND NOT AN UPLOADED FILE. A diagram's labels are text. Inline,
// they stay text — searchable, selectable, and translatable with the rest of
// the article. Uploaded as a picture they would have to be redrawn for every
// language. The upload path keeps rejecting SVG files (magic-byte sniff): a
// file is served from our origin and would be a document of its own, which is
// a different and much worse exposure than a drawing pasted into a body we
// sanitize here.
//
// WHAT MAKES IT SAFE. Only a drawing vocabulary is allowed, and everything
// that can carry behaviour is left out on purpose:
//
//   - <script>, and every on* handler (bluemonday strips those everywhere)
//   - <style> and the style attribute — an inline <svg><style> in an HTML page
//     is NOT scoped to the drawing, it restyles the whole document
//   - class — same reason: it would reach the site's own stylesheet
//   - <foreignObject> — it reopens arbitrary HTML inside the drawing
//   - <a>, <use>, <image>, and any href/xlink:href — no fetching, no
//     javascript: targets, no external references
//   - <animate>, <set>, <animateTransform> — they rewrite attributes after
//     sanitising, which is a way to smuggle a value past this allowlist
//
// What is left cannot execute, cannot load anything, and cannot style anything
// outside itself.

// svgShapes are the drawing elements. Their geometry lives in attributes, so
// each one is listed with the attributes it is allowed to carry.
var svgShapes = []string{
	"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
	"polygon", "text", "tspan", "defs", "marker", "linearGradient",
	"radialGradient", "stop", "title", "desc",
}

// svgCommonAttrs may appear on any allowed SVG element: how a shape is
// painted, where it sits, and what a screen reader makes of it.
var svgCommonAttrs = []string{
	"id", "transform", "opacity",
	"fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
	"stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
	"stroke-dashoffset", "stroke-miterlimit",
	"marker-start", "marker-mid", "marker-end",
	"font-family", "font-size", "font-weight", "font-style", "letter-spacing",
	"text-anchor", "dominant-baseline", "alignment-baseline",
	"role", "aria-label", "aria-hidden",
}

// svgGeometryAttrs are the per-shape numbers: positions, sizes, path data,
// gradient and marker setup.
var svgGeometryAttrs = []string{
	"x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
	"width", "height", "d", "points", "dx", "dy", "offset",
	"viewBox", "preserveAspectRatio", "xmlns",
	"stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
	"markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits",
}

// allowInlineSVG adds the drawing vocabulary above to a policy.
//
// AllowNoAttrs matters: a <g> or a <defs> usually carries nothing, and without
// it bluemonday drops an element that has no attributes left.
// svgFigurePattern is the one class a figure may carry: the wrapper the editor
// puts around a drawing. It exists so the stylesheet can let a wide diagram
// scroll sideways on a phone instead of shrinking its labels to nothing — the
// same treatment a wide table gets. Like the image and alignment classes, it
// is a fixed name the site's own CSS defines, not an open `class`.
var svgFigurePattern = regexp.MustCompile(`^kd-svg$`)

func allowInlineSVG(p *bluemonday.Policy) *bluemonday.Policy {
	p.AllowAttrs("class").Matching(svgFigurePattern).OnElements("figure")
	p.AllowElements(svgShapes...)
	p.AllowNoAttrs().OnElements(svgShapes...)
	p.AllowAttrs(svgCommonAttrs...).OnElements(svgShapes...)
	p.AllowAttrs(svgGeometryAttrs...).OnElements(svgShapes...)
	return p
}

// svgAttrCase is the spelling of every allowed SVG attribute whose name is not
// all lowercase. The HTML tokenizer bluemonday reads with lowercases attribute
// names, so `viewBox` comes out of the sanitizer as `viewbox`.
//
// A browser parsing it as HTML puts the case back (the spec's "adjust SVG
// attributes" table), so the drawing still renders — but the DOM, and anything
// that reads the stored HTML as XML, would not agree with what we stored. It
// also means the editor, which serialises from the DOM, would emit a different
// string from the one it was given and report every drawing as edited the
// moment it was opened.
var svgAttrCase = map[string]string{
	"viewbox":             "viewBox",
	"preserveaspectratio": "preserveAspectRatio",
	"gradientunits":       "gradientUnits",
	"gradienttransform":   "gradientTransform",
	"markerwidth":         "markerWidth",
	"markerheight":        "markerHeight",
	"markerunits":         "markerUnits",
	"refx":                "refX",
	"refy":                "refY",
}

var svgTagSet = func() map[string]bool {
	m := make(map[string]bool, len(svgShapes))
	for _, t := range svgShapes {
		m[t] = true
	}
	return m
}()

// restoreSVGAttrCase puts the camel case back into SVG attribute names.
//
// Only the tags of SVG elements are touched, and only by renaming attributes
// from the table above; every other byte of the sanitised HTML is copied
// through untouched, so this cannot reintroduce anything the policy removed.
func restoreSVGAttrCase(s string) string {
	if !strings.Contains(s, "<svg") {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	z := html.NewTokenizer(strings.NewReader(s))
	depth := 0
	for {
		tt := z.Next()
		if tt == html.ErrorToken {
			return b.String()
		}
		raw := string(z.Raw())
		switch tt {
		case html.StartTagToken, html.SelfClosingTagToken:
			name, _ := z.TagName()
			tag := string(name)
			if tag == "svg" {
				depth++
			}
			if depth > 0 && svgTagSet[tag] {
				raw = renameAttrs(raw)
			}
			// A void-style `<path/>` closes itself and never reaches the
			// EndTagToken below.
			if tag == "svg" && tt == html.SelfClosingTagToken {
				depth--
			}
		case html.EndTagToken:
			if name, _ := z.TagName(); string(name) == "svg" && depth > 0 {
				depth--
			}
		}
		b.WriteString(raw)
	}
}

// renameAttrs rewrites ` name=` inside one tag's raw text. The leading space is
// what makes it an attribute position rather than part of a value.
func renameAttrs(tag string) string {
	for lower, proper := range svgAttrCase {
		tag = strings.ReplaceAll(tag, " "+lower+"=", " "+proper+"=")
	}
	return tag
}
