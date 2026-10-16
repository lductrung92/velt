import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RichText } from "../app/components/RichText";

const render = (text: string) => renderToStaticMarkup(<RichText text={text} />);

test("assistant markdown becomes real emphasis, not literal asterisks", () => {
  const html = render("**Nat** — Kỹ sư hệ thống");
  assert.match(html, /<strong>Nat<\/strong>/);
  assert.ok(!html.includes("**"), "the markers themselves must be gone");
});

test("italic and code are rendered, and ** wins over *", () => {
  assert.match(render("*nghiêng*"), /<em>nghiêng<\/em>/);
  assert.match(render("_nghiêng_"), /<em>nghiêng<\/em>/);
  assert.match(render("`list_members`"), /<code>list_members<\/code>/);
  // The pattern is ordered longest-first; a lazy one would make **x** an <em>
  // wrapping *x*, which is the classic bug here.
  const both = render("**đậm** và *nghiêng*");
  assert.match(both, /<strong>đậm<\/strong>/);
  assert.match(both, /<em>nghiêng<\/em>/);
});

test("heading markers are dropped, the line stays", () => {
  const html = render("### Đội ngũ\nNat");
  assert.match(html, /<strong>Đội ngũ<\/strong>/);
  assert.ok(!html.includes("###"));
  assert.ok(html.includes("Nat"));
});

test("line structure survives", () => {
  // The bubble sets white-space: pre-wrap, so newlines carry the layout and
  // must reach the DOM rather than being collapsed away here.
  const html = render("một\nhai\nba");
  assert.equal((html.match(/\n/g) || []).length, 2);
});

/**
 * The reason this component exists rather than a Markdown library: the
 * assistant's output is shaped by whatever a visitor types, so it must never
 * become markup. These are the payloads a library plus innerHTML would run.
 */
test("nothing a visitor can make the assistant say becomes markup", () => {
  for (const attack of [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[click](javascript:alert(1))",
    "<iframe src='https://evil.test'></iframe>",
    "**<script>alert(1)</script>**",
  ]) {
    const html = render(attack);
    // The property is "no tag was created", not "the word never appears":
    // React escapes the payload, so `onerror` is still in the output — as
    // text, inside &lt;…&gt;, where it can never run. Asserting the word is
    // absent would be asserting the wrong thing and would fail on correct code.
    const tags = html.match(/<[a-z]+/gi) || [];
    for (const tag of tags)
      assert.ok(
        ["<span", "<strong", "<em", "<code"].includes(tag.toLowerCase()),
        `unexpected element ${tag} from: ${attack}`,
      );
    if (attack.includes("<"))
      assert.ok(html.includes("&lt;"), `payload was not escaped: ${attack}`);
    assert.ok(!/href=/i.test(html), `a link was created from: ${attack}`);
  }
});

test("unbalanced markers are left alone instead of eating the text", () => {
  // A stray asterisk is far more common than a formatting mistake, and
  // swallowing the rest of the line would lose the customer's words.
  assert.match(render("2 * 3 = 6"), /2 \* 3 = 6/);
  assert.match(render("**chưa đóng"), /\*\*chưa đóng/);
});
