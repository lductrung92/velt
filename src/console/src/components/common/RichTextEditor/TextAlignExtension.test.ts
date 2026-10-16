import { getSchema } from "@tiptap/core";
import { DOMParser as PMParser, DOMSerializer } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { TextAlignExtension } from "./TextAlignExtension";

// Through the schema, like the image node: what matters is the HTML read and
// written, since the server's sanitizer and the site's CSS are built against it.
const schema = getSchema([StarterKit, TextAlignExtension]);

function parse(html: string) {
  const dom = new window.DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  ).body;
  return PMParser.fromSchema(schema).parse(dom);
}

function serialize(html: string): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
    parse(html).content,
  );
  const box = document.createElement("div");
  box.appendChild(fragment);
  return box.innerHTML;
}

function alignOf(html: string) {
  let align: unknown = "missing";
  parse(html).descendants((node) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      align = node.attrs.textAlign;
    }
  });
  return align;
}

describe("TextAlignExtension", () => {
  it("keeps centre and right through a round trip", () => {
    expect(alignOf('<p class="kd-text--center">x</p>')).toBe("center");
    expect(alignOf('<h2 class="kd-text--right">x</h2>')).toBe("right");
    expect(serialize('<p class="kd-text--center">x</p>')).toContain(
      'class="kd-text--center"',
    );
    expect(serialize('<h2 class="kd-text--right">x</h2>')).toContain(
      'class="kd-text--right"',
    );
  });

  it("leaves an unaligned block bare", () => {
    // Left is the default, so it is the absence of a class — a `kd-text--left`
    // would be stripped by the server and must not be invented here either.
    expect(alignOf("<p>x</p>")).toBeNull();
    const out = serialize("<p>x</p>");
    expect(out).toBe("<p>x</p>");
  });

  it("ignores a class it does not own", () => {
    expect(alignOf('<p class="kd-text--left">x</p>')).toBeNull();
    expect(alignOf('<p class="text-center">x</p>')).toBeNull();
    expect(serialize('<p class="text-center">x</p>')).toBe("<p>x</p>");
  });
});
