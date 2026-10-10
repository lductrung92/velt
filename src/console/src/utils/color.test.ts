import { describe, expect, it } from "vitest";

import { hexToHslTriplet } from "./color";

describe("hexToHslTriplet", () => {
  it("converts the brand teal to the shadcn HSL triplet", () => {
    // #1da2b5 is the brand primary (index.css --primary, integer-rounded here;
    // the CSS token uses the precise `187.5 72.4% 41.2%`).
    expect(hexToHslTriplet("#1da2b5")).toBe("188 72% 41%");
  });

  it("handles the achromatic + primary extremes", () => {
    expect(hexToHslTriplet("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslTriplet("#000000")).toBe("0 0% 0%");
    expect(hexToHslTriplet("#ff0000")).toBe("0 100% 50%");
    expect(hexToHslTriplet("#00ff00")).toBe("120 100% 50%");
    expect(hexToHslTriplet("#0000ff")).toBe("240 100% 50%");
  });

  it("accepts uppercase + surrounding whitespace", () => {
    expect(hexToHslTriplet("  #FF0000 ")).toBe("0 100% 50%");
  });

  it("returns null for malformed input", () => {
    expect(hexToHslTriplet("#fff")).toBeNull(); // 3-digit shorthand unsupported
    expect(hexToHslTriplet("0f172a")).toBeNull(); // missing #
    expect(hexToHslTriplet("#zzzzzz")).toBeNull(); // non-hex
    expect(hexToHslTriplet("")).toBeNull();
  });
});
