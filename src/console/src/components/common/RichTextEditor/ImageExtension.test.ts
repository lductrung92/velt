import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { DOMParser as PMParser, DOMSerializer } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { ImageNode } from "./ImageExtension";

// The node is exercised through the schema rather than a mounted editor: what
// matters is the HTML it reads and writes, which is the contract the server's
// sanitizer and the site's CSS are both built against.
const schema = getSchema([StarterKit, ImageNode]);

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

function imageAttrs(html: string) {
  let attrs: Record<string, unknown> | null = null;
  parse(html).descendants((node) => {
    if (node.type.name === "image") attrs = node.attrs;
  });
  return attrs as Record<string, unknown> | null;
}

describe("ImageNode", () => {
  it("keeps the real size, the share of the column and the alignment", () => {
    // width/height are the file's own pixels — that pair is what reserves the
    // box — while the share of the column rides in a class beside the
    // alignment, so neither has to give up the attribute.
    const html =
      '<img src="/a.png" alt="A" width="1338" height="752" class="kd-img--w50 kd-img--center">';
    expect(imageAttrs(html)).toMatchObject({
      src: "/a.png",
      alt: "A",
      width: "1338",
      height: "752",
      size: "50",
      align: "center",
    });

    const out = serialize(html);
    expect(out).toContain('width="1338"');
    expect(out).toContain('height="752"');
    expect(out).toContain("kd-img--w50");
    expect(out).toContain("kd-img--center");
  });

  it("refuses a percentage in the size attributes", () => {
    // The sanitizer keeps only whole pixels there now, and a value the server
    // would strip must not survive parsing either.
    expect(imageAttrs('<img src="/a.png" width="50%">')?.width).toBeNull();
    expect(imageAttrs('<img src="/a.png" height="50%">')?.height).toBeNull();
  });

  it("writes pixels and percents, and nothing else", () => {
    // The sanitizer keeps `^[0-9]+%?$` on width — a value it would strip must
    // not survive parsing either, or the editor would show a size the saved
    // page does not have.
    expect(imageAttrs('<img src="/a.png" width="320">')?.width).toBe("320");
    expect(imageAttrs('<img src="/a.png" width="12.5em">')?.width).toBeNull();
    expect(
      imageAttrs('<img src="/a.png" width="calc(100% - 2px)">')?.width,
    ).toBeNull();
  });

  it("reads only the three alignment classes", () => {
    expect(imageAttrs('<img src="/a.png" class="kd-img--left">')?.align).toBe(
      "left",
    );
    expect(imageAttrs('<img src="/a.png" class="kd-img--right">')?.align).toBe(
      "right",
    );
    expect(
      imageAttrs('<img src="/a.png" class="float-left">')?.align,
    ).toBeNull();
  });

  it("emits a bare img when nothing has been set", () => {
    const out = serialize('<img src="/a.png">');
    expect(out).toContain('<img src="/a.png">');
    expect(out).not.toContain("width=");
    expect(out).not.toContain("class=");
  });
});
