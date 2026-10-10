import { type Locator, type Page } from "@playwright/test";

// Page object for the landing-page design flow: create a CMS page with
// kind=landing, then edit its sections in the Puck visual builder — now embedded
// inline in the page editor (/cms/pages/:id), not a separate /design screen.
// Accessibility-first + Puck's stable data-* hooks so specs survive markup churn.
export class LandingPage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  async gotoPageList(): Promise<void> {
    await this.page.goto("/cms/pages");
  }

  async gotoNewPage(): Promise<void> {
    await this.page.goto("/cms/pages/new");
  }

  // The design now lives inline in the page editor (the Puck builder mounts
  // below the page fields for a landing page).
  async gotoDesign(pageId: string): Promise<void> {
    await this.page.goto(`/cms/pages/${pageId}`);
  }

  pagesTable(): Locator {
    return this.page.getByTestId("cms-pages-table");
  }

  /** Fill the create form as a landing page and submit. */
  async createLandingPage(title: string): Promise<void> {
    // Kind is a react-select combobox (no visible label; named by aria-label).
    // Its focusable element is a 1px dummy input that never passes Playwright's
    // pointer actionability → open the menu with the keyboard instead.
    const kind = this.page.getByRole("combobox", { name: "Page type" });
    await kind.focus();
    await kind.press("ArrowDown"); // opens the portalled menu
    await this.page.getByRole("option", { name: "Landing page" }).click();
    await this.page.getByRole("textbox", { name: /^Title/ }).fill(title);
    await this.page.getByRole("button", { name: "Save" }).click();
  }

  // ── Puck editor surface (stable data-puck-* hooks + the Publish action). ──

  /**
   * The editor's header action — present iff the editor mounted. Puck's default
   * "Publish" is overridden to the app's "Save" button (shadcn Button → real
   * <button>).
   */
  saveButton(): Locator {
    return this.page.getByRole("button", { name: "Save" });
  }

  /** A block in the left palette (drawer), matched by its label. */
  paletteItem(label: string): Locator {
    return this.page
      .locator("[data-puck-drawer-item]")
      .filter({ hasText: label });
  }

  /** The canvas dropzone that holds the placed section cards. */
  canvas(): Locator {
    return this.page.locator("[data-puck-dropzone]").first();
  }

  /** A placed section card on the canvas, matched by visible text. */
  canvasCard(text: string): Locator {
    return this.canvas().getByText(text);
  }

  /**
   * Drag a palette block onto the canvas. Puck uses dnd-kit's PointerSensor
   * (no keyboard sensor), so we drive raw mouse moves: press, a small nudge to
   * clear the activation constraint, then step into the dropzone before release.
   */
  async dragToCanvas(label: string): Promise<void> {
    const src = this.paletteItem(label).first();
    const dst = this.canvas();
    // The builder is embedded below the page fields, so scroll it into view
    // before reading bounding boxes — the mouse drag uses viewport coordinates.
    await src.scrollIntoViewIfNeeded();
    const sb = await src.boundingBox();
    const db = await dst.boundingBox();
    if (!sb || !db) throw new Error("dragToCanvas: missing bounding box");
    const sx = sb.x + sb.width / 2;
    const sy = sb.y + sb.height / 2;
    const dx = db.x + db.width / 2;
    const dy = db.y + Math.min(db.height / 2, 40);
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    await this.page.mouse.move(sx + 8, sy + 8, { steps: 5 }); // pass activation
    await this.page.mouse.move(dx, dy, { steps: 20 });
    await this.page.mouse.move(dx, dy + 4, { steps: 5 });
    await this.page.mouse.up();
  }
}
