import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { TableExtensions } from "./TableExtension";
import { TextAlignExtension } from "./TextAlignExtension";

// The extension set the editor mounts. Opening an article and saving it
// rewrites body_html to whatever comes out of here, so what this loses is what
// the editor destroys — which is exactly how a published article lost its
// comparison table and read "Tiêu chíWeb PushEmail".
const EXT = [StarterKit, TextAlignExtension, ...TableExtensions];
const edit = (html: string) => generateHTML(generateJSON(html, EXT), EXT);

const TABLE =
  "<table><thead><tr><th>Tiêu chí</th><th>Web Push</th><th>Email</th></tr></thead>" +
  "<tbody><tr><td>Chi phí</td><td>Không mất phí từng tin</td><td>Tuỳ hạ tầng</td></tr></tbody></table>";

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("TableExtension", () => {
  it("keeps every cell in its own column", () => {
    const out = edit(TABLE);
    expect(out).toContain("<table");
    expect(out.match(/<t[dh]\b/g)).toHaveLength(6);
    // The failure this guards against glues the cells into one word.
    expect(words(out)).toContain("Tiêu chí Web Push Email");
  });

  it("writes no width the server would strip", () => {
    const out = edit(TABLE);
    // htmlsan.Body drops `style` and would leave an empty <colgroup> behind,
    // so emitting either means the stored HTML can never match what the editor
    // just produced — and every article with a table opens dirty.
    expect(out).not.toContain("style=");
    expect(out).not.toContain("<colgroup");
  });

  it("reopens its own output unchanged", () => {
    const once = edit(TABLE);
    expect(edit(once)).toBe(once);
  });
});
