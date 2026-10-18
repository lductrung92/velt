import { describe, expect, it } from "vitest";

import { originalImageUrl } from "./DeviceFrame";

describe("originalImageUrl", () => {
  it("asks for the stored bytes instead of a rendering", () => {
    // /img re-encodes (WebP q80 for anything that samples as a photograph,
    // which a UI screenshot does); /files hands back what was uploaded.
    expect(originalImageUrl("http://localhost/img/gallery-9f3c21aa.webp")).toBe(
      "http://localhost/files/gallery-9f3c21aa.webp",
    );
    expect(originalImageUrl("/img/gallery-9f3c21aa.png")).toBe(
      "/files/gallery-9f3c21aa.png",
    );
  });

  it("leaves an entry that has no /files sibling alone", () => {
    // Uploaded before the media registry: its URL already names the original.
    const legacy = "http://localhost/api/files/products/p1/gallery-1.png";
    expect(originalImageUrl(legacy)).toBe(legacy);
    expect(originalImageUrl("/img/odd-name.gif")).toBe("/img/odd-name.gif");
  });
});
