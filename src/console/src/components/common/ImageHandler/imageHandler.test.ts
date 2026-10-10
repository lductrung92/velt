import { describe, expect, it } from "vitest";

import type { CropEditState } from "./types";
import { computeDimensions, defaultCrop, outputSize } from "./utils";
import { clampZoom, MAX_ZOOM, MIN_ZOOM } from "./zoom";

const img = (w: number, h: number) =>
  ({ naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement;
const cropState = (
  unit: "%" | "px",
  width: number,
  height: number,
): CropEditState => ({
  crop: { unit, x: 0, y: 0, width, height },
  rotation: 0,
  zoom: 1,
  flipH: false,
  flipV: false,
  offsetX: 0,
  offsetY: 0,
});

describe("outputSize", () => {
  it("full crop → natural resolution when under the cap", () => {
    expect(outputSize(img(1600, 900), cropState("%", 100, 100), 4000)).toEqual({
      w: 1600,
      h: 900,
    });
  });
  it("percent crop scales the natural region", () => {
    expect(outputSize(img(4000, 2000), cropState("%", 50, 50), 9999)).toEqual({
      w: 2000,
      h: 1000,
    });
  });
  it("caps the longest side, preserving aspect (7680 to 2560)", () => {
    expect(
      outputSize(img(7680, 4320), cropState("%", 100, 100), 2560),
    ).toEqual({ w: 2560, h: 1440 });
  });
  it("cap 0 → no downscale, native resolution kept", () => {
    expect(outputSize(img(7680, 4320), cropState("%", 100, 100), 0)).toEqual({
      w: 7680,
      h: 4320,
    });
  });
  it("pixel-unit crop uses raw pixels", () => {
    expect(
      outputSize(img(4000, 3000), cropState("px", 1200, 800), 9999),
    ).toEqual({ w: 1200, h: 800 });
  });
  it("invalid crop falls back to the natural size", () => {
    expect(outputSize(img(800, 600), cropState("%", 0, 0), 9999)).toEqual({
      w: 800,
      h: 600,
    });
  });
});

describe("computeDimensions", () => {
  it("circle → square of radius*2", () => {
    expect(computeDimensions({ type: "circle", radius: 64 })).toEqual({ w: 128, h: 128 });
  });
  it("rounded → width × round(width/ratio)", () => {
    expect(computeDimensions({ type: "rounded", ratio: 16 / 9, width: 320 })).toEqual({
      w: 320,
      h: 180,
    });
    expect(computeDimensions({ type: "rounded", ratio: 1, width: 200 })).toEqual({
      w: 200,
      h: 200,
    });
  });
  it("throws on missing/invalid props", () => {
    expect(() => computeDimensions({ type: "circle" })).toThrow();
    expect(() => computeDimensions({ type: "circle", radius: 0 })).toThrow();
    expect(() => computeDimensions({ type: "rounded", width: 100 })).toThrow();
    expect(() => computeDimensions({ type: "rounded", ratio: 1, width: 0 })).toThrow();
  });
});

describe("defaultCrop", () => {
  it("locks to aspect and stays centred within 0..100%", () => {
    const c = defaultCrop(1000, 1000, 1); // square image, square aspect
    expect(c.unit).toBe("%");
    // width/height ≈ 80, centred
    expect(c.width).toBeCloseTo(80, 5);
    expect(c.height).toBeCloseTo(80, 5);
    expect(c.x).toBeCloseTo(10, 5);
    expect(c.y).toBeCloseTo(10, 5);
  });
  it("wide image, 1:1 aspect → height-bound, fully on-canvas", () => {
    const c = defaultCrop(2000, 1000, 1);
    for (const v of [c.x, c.y, c.width, c.height]) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(c.x + c.width).toBeLessThanOrEqual(100.0001);
    expect(c.y + c.height).toBeLessThanOrEqual(100.0001);
  });
  it("tall image, 16:9 aspect → fully on-canvas", () => {
    const c = defaultCrop(1000, 2000, 16 / 9);
    expect(c.x + c.width).toBeLessThanOrEqual(100.0001);
    expect(c.y + c.height).toBeLessThanOrEqual(100.0001);
  });
});

describe("clampZoom", () => {
  it("clamps to [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampZoom(0.5)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(2)).toBe(2);
  });
  it("non-finite / non-positive → MIN_ZOOM", () => {
    expect(clampZoom(NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
    expect(clampZoom(Infinity)).toBe(MIN_ZOOM); // !Number.isFinite → MIN_ZOOM
  });
});
