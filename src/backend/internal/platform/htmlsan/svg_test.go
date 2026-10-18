package htmlsan_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/platform/htmlsan"
)

// A drawing the editor's SVG tool would produce.
const diagram = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" role="img" aria-label="Ba kênh">` +
	`<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">` +
	`<path d="M0 0 L8 4 L0 8 z" fill="#9fb0c6"/></marker></defs>` +
	`<rect x="8" y="8" width="140" height="60" rx="8" fill="#ffffff" stroke="#dbe3ee"/>` +
	`<line x1="150" y1="38" x2="200" y2="38" stroke="#9fb0c6" marker-end="url(#arrow)"/>` +
	`<text x="20" y="40" font-size="14" font-weight="600" fill="#16202e">Web Push</text>` +
	`<g opacity="0.8"><circle cx="280" cy="38" r="10" fill="#15803d"/></g>` +
	`</svg>`

func TestInlineSVGSurvives(t *testing.T) {
	out := htmlsan.Body("<p>Trước</p>" + diagram + "<p>Sau</p>")

	for _, want := range []string{
		"<svg", "viewBox=\"0 0 320 120\"", "<marker", "<path", "d=\"M0 0 L8 4 L0 8 z\"",
		"<rect", "<line", "marker-end=\"url(#arrow)\"", "<text", "Web Push",
		"<g", "<circle", "aria-label=\"Ba kênh\"",
	} {
		require.Contains(t, out, want, "mat phan nay cua so do")
	}
	// Sanitising twice must not keep changing it: the stored HTML is what the
	// editor opens next time.
	require.Equal(t, out, htmlsan.Body(out))
}

func TestInlineSVGDropsEverythingExecutable(t *testing.T) {
	cases := map[string]string{
		"script trong svg":    `<svg><script>alert(1)</script><rect width="10" height="10"/></svg>`,
		"on handler":          `<svg><rect width="10" height="10" onload="alert(1)"/></svg>`,
		"onclick tren text":   `<svg><text x="1" y="1" onclick="alert(1)">x</text></svg>`,
		"style element":       `<svg><style>body{display:none}</style><rect width="10" height="10"/></svg>`,
		"style attribute":     `<svg><rect width="10" height="10" style="position:fixed;inset:0"/></svg>`,
		"class":               `<svg><rect width="10" height="10" class="blog-prose"/></svg>`,
		"foreignObject":       `<svg><foreignObject><img src="x" onerror="alert(1)"></foreignObject></svg>`,
		"lien ket javascript": `<svg><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>`,
		"use ngoai":           `<svg><use href="https://evil.test/x.svg#a"/></svg>`,
		"image ngoai":         `<svg><image href="https://evil.test/x.png" width="10" height="10"/></svg>`,
		"animate":             `<svg><rect width="10" height="10"><animate attributeName="href" to="javascript:alert(1)"/></rect></svg>`,
		"xlink":               `<svg><use xlink:href="#a"/></svg>`,
	}
	for name, in := range cases {
		out := htmlsan.Body(in)
		for _, forbidden := range []string{
			"<script", "onload", "onclick", "onerror", "<style", "style=", "class=",
			"<foreignobject", "<a ", "href", "<use", "<image", "<animate", "javascript:",
		} {
			require.False(t, strings.Contains(strings.ToLower(out), forbidden),
				"%s: con sot %q trong %q", name, forbidden, out)
		}
	}
}
