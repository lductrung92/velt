import { describe, expect, it } from "vitest";

/**
 * The action cell is a shared component, and this keeps it that way.
 *
 * Every list table used to grow its own copy: five stylesheets held the same
 * flex rule under five class names, three screens answered with a kebab menu,
 * and three painted the bin with the fill red instead of the ink red. Each was
 * individually invisible — only the whole set read as untidy. A unit test can
 * check one screen; this checks that no screen has drifted off the component.
 *
 * The sources are read through Vite's glob rather than node:fs, because the
 * app's tsconfig deliberately keeps node globals out of browser code.
 */

const SOURCES = import.meta.glob("/src/**/*.{ts,tsx,css}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FILES = Object.entries(SOURCES)
  .filter(([path]) => !path.includes(".test."))
  .map(([path, text]) => ({ path, text }));

describe("row actions stay shared", () => {
  it("finds the files to scan", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("has no per-module copy of the action-cell layout", () => {
    // e.g. .tag-row-actions, .pcat-row-actions — one rule lives in list-page.css.
    const copies = FILES.filter(({ text }) => /[\w-]+-row-actions/.test(text));
    expect(copies.map((f) => f.path)).toEqual([]);
  });

  it("never paints a row icon with the fill red", () => {
    // --destructive is tuned as a FILL behind white text; as an icon colour it
    // measures 2.03:1 in dark mode. Icons take --destructive-ink.
    const wrong = FILES.filter(({ text }) =>
      /<(Trash2|LogOut|Pencil)[^>]*text-destructive"/.test(text),
    );
    expect(wrong.map((f) => f.path)).toEqual([]);
  });

  it("builds every action cell from the shared component", () => {
    const cells = FILES.filter(
      ({ path, text }) =>
        text.includes('className="row-actions"') && !path.includes("RowActions"),
    );
    expect(cells.map((f) => f.path)).toEqual([]);
  });
});
