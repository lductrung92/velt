import type { Data } from "@puckeditor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolvePendingImages,
  sectionsToPuckData,
  syncSections,
} from "./adapter";
import { landingService } from "../../services/landing.service";
import type {
  LandingDetail,
  LandingSection,
} from "../../services/landing.service";

vi.mock("../../services/landing.service", () => ({
  landingService: {
    updateSection: vi.fn(),
    createSection: vi.fn(),
    deleteSection: vi.fn(),
    reorderSections: vi.fn(),
    uploadMedia: vi.fn(),
    get: vi.fn(),
  },
}));

const svc = vi.mocked(landingService);

function section(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
  is_visible = true,
): LandingSection {
  return { id, type, sort_order: 0, is_visible, config } as LandingSection;
}

function detailOf(sections: LandingSection[]): LandingDetail {
  return {
    id: "lp-1",
    key: "home",
    name: "Home",
    status: "draft",
    og_url: null,
    seo: {} as LandingDetail["seo"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    sections,
  };
}

function puckData(
  items: { type: string; id: string; cfg?: Record<string, unknown>; visible?: boolean }[],
): Data {
  return {
    content: items.map((i) => ({
      type: i.type,
      props: { cfg: i.cfg ?? {}, visible: i.visible, id: i.id },
    })),
    root: { props: {} },
  } as unknown as Data;
}

beforeEach(() => {
  vi.clearAllMocks();
  // createSection returns a detail whose LAST section is the newly created one,
  // mirroring the backend (append). Give it a fresh id "created-N".
  let n = 0;
  svc.createSection.mockImplementation(async (_landingId, body) => {
    n += 1;
    const created = section(`created-${n}`, body.type, body.config ?? {}, body.is_visible ?? true);
    return detailOf([created]);
  });
  svc.updateSection.mockResolvedValue(detailOf([]));
  svc.deleteSection.mockResolvedValue(undefined as never);
  svc.reorderSections.mockResolvedValue(detailOf([]));
  svc.get.mockResolvedValue(detailOf([section("final", "hero")]));
});

describe("sectionsToPuckData", () => {
  it("maps config→cfg, is_visible→visible, keeps the backend id", () => {
    const data = sectionsToPuckData([
      section("a", "hero", { heading: "Hi" }, true),
      section("b", "cta_banner", { heading: "Buy" }, false),
    ]);
    expect(data.content).toEqual([
      {
        type: "hero",
        props: { cfg: { heading: "Hi" }, visible: true, fullWidth: false, id: "a" },
      },
      {
        type: "cta_banner",
        props: { cfg: { heading: "Buy" }, visible: false, fullWidth: false, id: "b" },
      },
    ]);
  });

  it("maps config.full_width → the fullWidth prop", () => {
    const data = sectionsToPuckData([
      section("a", "hero", { heading: "Hi", full_width: true }, true),
      section("b", "hero", { heading: "No" }, true),
    ]);
    expect(data.content[0].props.fullWidth).toBe(true);
    expect(data.content[1].props.fullWidth).toBe(false);
  });

  it("clones config (mutating the Puck copy must not touch the source)", () => {
    const src = section("a", "hero", { heading: "Hi" });
    const data = sectionsToPuckData([src]);
    (data.content[0].props as { cfg: Record<string, unknown> }).cfg.heading = "X";
    expect(src.config.heading).toBe("Hi");
  });
});

describe("syncSections", () => {
  it("updates a kept section with its config + visibility", async () => {
    const detail = detailOf([section("a", "hero", { heading: "old" }, true)]);
    await syncSections(
      detail,
      puckData([{ type: "hero", id: "a", cfg: { heading: "new" }, visible: false }]),
    );
    expect(svc.updateSection).toHaveBeenCalledWith("a", {
      config: { heading: "new" },
      is_visible: false,
    });
    expect(svc.createSection).not.toHaveBeenCalled();
    expect(svc.deleteSection).not.toHaveBeenCalled();
  });

  it("creates a section for a Puck-generated (unknown) id", async () => {
    const detail = detailOf([]);
    await syncSections(
      detail,
      puckData([{ type: "cta_banner", id: "puck-tmp", cfg: { heading: "y" } }]),
    );
    expect(svc.createSection).toHaveBeenCalledWith("lp-1", {
      type: "cta_banner",
      config: { heading: "y" },
      is_visible: true, // defaulted when the prop is absent
    });
  });

  it("deletes sections removed in the editor", async () => {
    const detail = detailOf([
      section("a", "hero"),
      section("b", "cta_banner"),
    ]);
    await syncSections(detail, puckData([{ type: "hero", id: "a" }]));
    expect(svc.deleteSection).toHaveBeenCalledWith("b");
    expect(svc.deleteSection).toHaveBeenCalledTimes(1);
  });

  it("reorders to the editor's order using created ids for new items", async () => {
    const detail = detailOf([section("a", "hero"), section("b", "cta_banner")]);
    // end-state: [b(kept), new(created), a(kept)]; b's original sibling order flips.
    await syncSections(
      detail,
      puckData([
        { type: "cta_banner", id: "b" },
        { type: "hero", id: "new-1" }, // unknown → created-1
        { type: "hero", id: "a" },
      ]),
    );
    expect(svc.reorderSections).toHaveBeenCalledWith("lp-1", [
      "b",
      "created-1",
      "a",
    ]);
  });

  it("empty editor deletes every section and reorders to []", async () => {
    const detail = detailOf([section("a", "hero"), section("b", "cta_banner")]);
    await syncSections(detail, puckData([]));
    expect(svc.deleteSection).toHaveBeenCalledWith("a");
    expect(svc.deleteSection).toHaveBeenCalledWith("b");
    expect(svc.reorderSections).toHaveBeenCalledWith("lp-1", []);
  });

  it("returns the refreshed detail from landingService.get", async () => {
    const detail = detailOf([section("a", "hero")]);
    const out = await syncSections(detail, puckData([{ type: "hero", id: "a" }]));
    expect(svc.get).toHaveBeenCalledWith("lp-1");
    expect(out.sections[0].id).toBe("final");
  });
});

describe("resolvePendingImages", () => {
  beforeEach(() => {
    // dataUrlToFile() fetches the data URL for its bytes; stub it.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: async () => new Blob(["x"], { type: "image/png" }),
      }),
    );
    svc.uploadMedia.mockResolvedValue({ path: "cms/x.png", url: "https://cdn/x.png" });
  });

  it("uploads a top-level pending image and rewrites it to *_path/*_url", async () => {
    const data = {
      content: [
        {
          type: "hero",
          props: { id: "a", cfg: { heading: "H", image_path__pending: { dataUrl: "data:image/png;base64,AAA" } } },
        },
      ],
      root: { props: {} },
    } as unknown as Data;

    const out = (await resolvePendingImages("lp-1", data)) as unknown as {
      content: { props: { cfg: Record<string, unknown> } }[];
    };
    const cfg = out.content[0].props.cfg;
    expect(svc.uploadMedia).toHaveBeenCalledTimes(1);
    expect(cfg.image_path).toBe("cms/x.png");
    expect(cfg.image_url).toBe("https://cdn/x.png");
    expect(cfg.image_path__pending).toBeUndefined();
    expect(cfg.heading).toBe("H"); // untouched
  });

  it("resolves pending images nested inside arrays (e.g. slides)", async () => {
    const data = {
      content: [
        {
          type: "slider",
          props: {
            id: "a",
            cfg: {
              slides: [
                { heading: "s1", image_path__pending: { dataUrl: "data:image/png;base64,AAA" } },
                { heading: "s2" },
              ],
            },
          },
        },
      ],
      root: { props: {} },
    } as unknown as Data;

    const out = (await resolvePendingImages("lp-1", data)) as unknown as {
      content: { props: { cfg: { slides: Record<string, unknown>[] } } }[];
    };
    const slides = out.content[0].props.cfg.slides;
    expect(svc.uploadMedia).toHaveBeenCalledTimes(1);
    expect(slides[0].image_path).toBe("cms/x.png");
    expect(slides[0].image_path__pending).toBeUndefined();
    expect(slides[1].image_path).toBeUndefined(); // no pending → no upload
  });

  it("does not touch data without pending markers", async () => {
    const data = {
      content: [{ type: "hero", props: { id: "a", cfg: { image_path: "kept.png" } } }],
      root: { props: {} },
    } as unknown as Data;
    const out = (await resolvePendingImages("lp-1", data)) as unknown as {
      content: { props: { cfg: Record<string, unknown> } }[];
    };
    expect(svc.uploadMedia).not.toHaveBeenCalled();
    expect(out.content[0].props.cfg.image_path).toBe("kept.png");
  });
});
