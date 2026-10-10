import { expect, test } from "@playwright/test";

import { cmsPage, landing, mockCmsApi } from "../mocks/cms";
import { LandingPage } from "../pages/landing.page";

// A landing seeded with one hero section (heading "Welcome") for the render/edit
// spec. Sections aren't part of the landing() helper's default, so build inline.
const homeWithHero = () => ({
  ...landing("lp-x", "Home", "home"),
  sections: [
    {
      id: "sec-1",
      type: "hero",
      sort_order: 0,
      is_visible: true,
      config: { heading: "Welcome" },
    },
  ],
});

test.describe("CMS Landing design (Puck, via pages)", () => {
  test("create a landing page → the Puck editor opens inline", async ({ page }) => {
    await mockCmsApi(page);
    const lp = new LandingPage(page);

    await lp.gotoNewPage();
    await lp.createLandingPage("Homepage");

    // kind=landing → backend auto-creates the landing; editing continues on the
    // page editor (/cms/pages/{id}) with the Puck builder embedded inline.
    await expect(page).toHaveURL(/\/cms\/pages\/[^/]+$/);
    // Save action + the block palette are present (design mounted inline).
    await expect(lp.saveButton()).toBeVisible();
    await expect(lp.paletteItem("Hero").first()).toBeVisible();
  });

  test("an existing section renders on the canvas and edits in the panel", async ({
    page,
  }) => {
    await mockCmsApi(page, {
      pages: [cmsPage("pg-x", "Home", "lp-x")],
      landings: [homeWithHero()],
    });
    const lp = new LandingPage(page);

    await lp.gotoDesign("pg-x");

    // The hero card shows its summary text on the canvas.
    await expect(lp.canvasCard("Welcome")).toBeVisible();

    // Selecting it opens the app's own section form in the right panel with the
    // stored value (proves SECTION_FORMS is mounted inside Puck — full parity).
    await lp.canvasCard("Welcome").click();
    // one of the panel's inputs holds the stored heading (controlled value, so
    // assert the live DOM value rather than an attribute).
    await expect
      .poll(() =>
        page
          .getByRole("textbox")
          .evaluateAll((els) =>
            els.some((e) => (e as HTMLInputElement).value === "Welcome"),
          ),
      )
      .toBe(true);
    // the section toggles (Puck custom fields → is_visible + full_width) are present.
    await expect(page.getByRole("switch")).toHaveCount(2);

    // the overridden "Save" header action persists via the section-sync API.
    await lp.saveButton().click();
    await expect(page.getByText("Saved")).toBeVisible();
  });

  test("Outline tab lists sections and reorders them", async ({ page }) => {
    await mockCmsApi(page, {
      pages: [cmsPage("pg-x", "Home", "lp-x")],
      landings: [
        {
          ...landing("lp-x", "Home", "home"),
          sections: [
            { id: "s1", type: "hero", sort_order: 0, is_visible: true, config: {} },
            { id: "s2", type: "cta_banner", sort_order: 1, is_visible: true, config: {} },
          ],
        },
      ],
    });
    const lp = new LandingPage(page);
    await lp.gotoDesign("pg-x");
    await expect(lp.saveButton()).toBeVisible();

    await page.getByText("Outline", { exact: true }).click();
    const outline = page.getByTestId("landing-outline");
    const items = outline.getByTestId("landing-outline-item");
    await expect(items.first()).toContainText("Hero");
    await expect(items.last()).toContainText("CTA banner");

    // drag the first section (Hero) below the second via its grip handle
    // (dnd-kit PointerSensor — small nudge to pass the activation distance, then
    // move onto the target and release).
    const handle = items
      .first()
      .getByRole("button", { name: "Drag to reorder" });
    const hb = await handle.boundingBox();
    const tb = await items.last().boundingBox();
    if (!hb || !tb) throw new Error("missing bounding box");
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 10, {
      steps: 5,
    });
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height - 4, {
      steps: 15,
    });
    await page.mouse.up();

    await expect(items.first()).toContainText("CTA banner");
    await expect(items.last()).toContainText("Hero");
  });

  test("drag a block from the palette onto the canvas", async ({ page }) => {
    await mockCmsApi(page);
    const lp = new LandingPage(page);

    await lp.gotoNewPage();
    await lp.createLandingPage("Homepage");
    await expect(lp.saveButton()).toBeVisible();

    // canvas starts empty, then a dragged Hero block appears as a card.
    await expect(lp.canvas().locator("[data-puck-component]")).toHaveCount(0);
    await lp.dragToCanvas("Hero");
    await expect(
      lp.canvas().locator("[data-puck-component]"),
    ).toHaveCount(1);
  });

  test("a page with a landing shows the Landing badge in the list", async ({
    page,
  }) => {
    await mockCmsApi(page, {
      pages: [cmsPage("pg-x", "Pricing", "lp-x")],
      landings: [landing("lp-x", "Pricing", "pricing")],
    });
    const lp = new LandingPage(page);

    await lp.gotoPageList();
    await expect(lp.pagesTable()).toContainText("Pricing");
    await expect(
      lp.pagesTable().getByText("Landing", { exact: true }),
    ).toBeVisible();
  });

  test("a content page (no landing) shows no design builder", async ({
    page,
  }) => {
    await mockCmsApi(page, { pages: [cmsPage("pg-y", "About")] });
    const lp = new LandingPage(page);

    await lp.gotoDesign("pg-y");
    // Content page → the body editor is shown, not the Puck builder.
    await expect(page.getByRole("textbox", { name: /^Title/ })).toBeVisible();
    await expect(page.getByText("Page design", { exact: true })).toHaveCount(0);
    await expect(lp.paletteItem("Hero")).toHaveCount(0);
  });

  test("without cms.landing.manage the embedded design is gated", async ({
    page,
  }) => {
    await mockCmsApi(page, {
      permissions: ["cms.page.view"],
      pages: [cmsPage("pg-x", "Pricing", "lp-x")],
      landings: [landing("lp-x", "Pricing", "pricing")],
    });
    const lp = new LandingPage(page);

    await lp.gotoDesign("pg-x");
    // Page editor loads (cms.page.view) but the design is gated on
    // cms.landing.manage → a notice replaces the Puck builder.
    await expect(
      page.getByText("You don't have permission to edit this page's design."),
    ).toBeVisible();
    await expect(lp.paletteItem("Hero")).toHaveCount(0);
  });
});
