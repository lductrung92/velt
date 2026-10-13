import { describe, expect, it } from "vitest";

import { defaultSectionConfig } from "./forms";
import { HOME_SECTION_TYPES } from "./types";

// The five home-page sections share their config contract with the backend and
// the public site, so pin the seed each one is created with.
describe("defaultSectionConfig — home sections", () => {
  it("seeds audience_picker with an empty item list", () => {
    expect(defaultSectionConfig("audience_picker")).toEqual({ items: [] });
  });

  it("seeds product_grid with a limit filter", () => {
    expect(defaultSectionConfig("product_grid")).toEqual({ limit: 6 });
  });

  it("seeds team with a limit filter", () => {
    expect(defaultSectionConfig("team")).toEqual({ limit: 6 });
  });

  it("seeds buying_steps with an empty step list", () => {
    expect(defaultSectionConfig("buying_steps")).toEqual({ steps: [] });
  });

  it("seeds contact_form empty", () => {
    expect(defaultSectionConfig("contact_form")).toEqual({});
  });

  // The dynamic pair draws its content from the catalogue / roster at read time,
  // so neither may seed an inline item list.
  it("gives the dynamic sections no item list", () => {
    for (const type of ["product_grid", "team"] as const) {
      const cfg = defaultSectionConfig(type);
      expect(cfg.items).toBeUndefined();
      expect(cfg.steps).toBeUndefined();
    }
  });

  it("returns a plain object for every home section type", () => {
    for (const type of HOME_SECTION_TYPES) {
      expect(defaultSectionConfig(type)).toBeTypeOf("object");
    }
  });
});
