import { describe, expect, it } from "vitest";

import { readAt, textFields, writeAt } from "./widgetText";

describe("widgetText", () => {
  it("offers the prose of a block and nothing else", () => {
    const fields = textFields("product_grid", {
      title: "Sản phẩm nổi bật",
      category: "do-choi",
      sort: "newest",
      limit: 6,
    });
    expect(fields).toEqual([
      {
        path: ["title"],
        original: "Sản phẩm nổi bật",
        labelKey: "cms.pages.widget.product_grid.heading",
        long: false,
      },
    ]);
  });

  it("offers the box before the source language has been written", () => {
    // The form must look the same every time it is opened, so a box is not
    // conjured by typing Vietnamese into the field above it.
    expect(textFields("rich_text", { width: "normal" })).toEqual([
      {
        path: ["html"],
        original: "",
        labelKey: "cms.pages.widget.rich_text.html",
        long: true,
      },
    ]);
    // A CTA with no buttons yet still offers the first one's label and link.
    expect(textFields("cta_banner", {}).map((f) => f.path.join("."))).toEqual([
      "heading",
      "sub",
      "buttons.0.label",
      "buttons.0.href",
    ]);
  });

  it("expands a CTA's buttons, href included", () => {
    const fields = textFields("cta_banner", {
      heading: "Bắt đầu",
      sub: "",
      align: "center",
      buttons: [
        { label: "Dùng thử", href: "/dang-ky", style: "primary" },
        { label: "Xem giá", href: "/bang-gia" },
      ],
    });
    expect(fields.map((f) => f.path.join("."))).toEqual([
      "heading",
      "sub",
      "buttons.0.label",
      "buttons.1.label",
      "buttons.0.href",
      "buttons.1.href",
    ]);
    // The style is an identifier, not prose.
    expect(fields.some((f) => f.path.includes("style"))).toBe(false);
  });

  it("writes into the shape the server merges onto", () => {
    const draft = writeAt({}, ["buttons", "0", "label"], "Try it");
    expect(draft).toEqual({ buttons: [{ label: "Try it" }] });
    expect(readAt(draft, ["buttons", "0", "label"])).toBe("Try it");
    // Editing one box leaves the others where they were.
    const both = writeAt(draft, ["heading"], "Get started");
    expect(both).toEqual({
      heading: "Get started",
      buttons: [{ label: "Try it" }],
    });
  });

  it("reads a missing path as empty rather than throwing", () => {
    expect(readAt({}, ["buttons", "0", "label"])).toBe("");
    expect(readAt({ title: 6 }, ["title"])).toBe("");
  });
});
