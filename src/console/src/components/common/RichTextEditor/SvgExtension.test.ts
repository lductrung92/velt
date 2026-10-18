import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { SvgNode } from "./SvgExtension";
import { sanitizeSvg } from "./svgSafe";

const EXT = [StarterKit, SvgNode];
const edit = (html: string) => generateHTML(generateJSON(html, EXT), EXT);

const DIAGRAM =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" role="img" aria-label="Hai kênh">' +
  '<rect x="4" y="4" width="90" height="40" rx="6" fill="#fff" stroke="#dbe3ee"></rect>' +
  '<text x="12" y="28" font-size="13" fill="#16202e">Web Push</text>' +
  "</svg>";

describe("sanitizeSvg", () => {
  it("keeps the drawing and its labels", () => {
    const out = sanitizeSvg(DIAGRAM);
    expect(out).toContain("<svg");
    expect(out).toContain("Web Push");
    expect(out).toContain('<rect x="4" y="4" width="90" height="40"');
    // The camel case matters: the server puts it back after sanitising
    // (htmlsan/svg.go), so both sides agree on the same spelling.
    expect(out).toContain("viewBox");
  });

  it("removes everything that could run or reach outside the drawing", () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10">' +
        "<script>alert(1)</script>" +
        '<style>body{display:none}</style>' +
        '<foreignObject><b>x</b></foreignObject>' +
        '<a href="javascript:alert(1)"><rect width="4" height="4"/></a>' +
        '<use href="https://evil.test/x.svg#a"/>' +
        '<rect width="4" height="4" onload="alert(1)" style="position:fixed" class="blog-prose"/>' +
        "</svg>",
    ).toLowerCase();
    for (const gone of [
      "script",
      "<style",
      "foreignobject",
      "javascript:",
      "<a ",
      "<use",
      "onload",
      "style=",
      "class=",
    ]) {
      expect(out).not.toContain(gone);
    }
    expect(out).toContain("<rect");
  });

  it("answers empty when there is no drawing to insert", () => {
    expect(sanitizeSvg("chữ thường thôi")).toBe("");
  });
});

describe("SvgNode", () => {
  it("carries a drawing through the editor unchanged", () => {
    const once = edit(`<p>Trước</p>${DIAGRAM}<p>Sau</p>`);
    expect(once).toContain("<svg");
    expect(once).toContain("Web Push");
    // Reopening what it just wrote must not change it, or every article with
    // a drawing would report unsaved changes the moment it was opened.
    expect(edit(once)).toBe(once);
  });

  it("does not let a drawing smuggle a script into the document", () => {
    const out = edit('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>');
    expect(out.toLowerCase()).not.toContain("script");
  });
});
