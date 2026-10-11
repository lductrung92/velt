import { describe, expect, it } from "vitest";

import { hexToHslTriplet } from "./color";

describe("hexToHslTriplet", () => {
  it("converts the Zukatek blue to the shadcn HSL triplet", () => {
    // #0061fd is the brand primary (index.css --primary, integer-rounded here;
    // the CSS token uses the precise `217 100% 49.6%`).
    expect(hexToHslTriplet("#0061fd")).toBe("217 100% 50%");
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
