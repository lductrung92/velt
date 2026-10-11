import { test, expect } from "@playwright/test";

test("HTML response contains SSR content; all pages work with JavaScript disabled", async ({
  browser,
  request,
}) => {
  const response = await request.get("/products?q=so%20ghi%20chu&ref=member-1");
  expect(response.headers()["x-zukatek-render"]).toBe("react-ssr");
  const html = await response.text();
  expect(html).toContain("Sổ ghi chú");
  expect(html).toContain('class="catalog-card"');
  expect(html).not.toContain('src="app.js"');
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: "http://127.0.0.1:4175",
  });
  const page = await context.newPage();
  for (const path of [
    "/",
    "/products",
    "/products/example-1",
    "/product.html?id=example-1",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".site-header")).toBeVisible();
  }
  await page.goto("/");
  await expect(page.locator(".member-card")).toHaveCount(5);
  await expect(page.locator("#product-list .catalog-card")).toHaveCount(6);
  await context.close();
  expect((await request.get("/products/missing")).status()).toBe(404);
});

test("hydration, catalogue, product details, referrals and local contact flow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/?ref=member-1");
  await page.locator(".profile-button").first().click();
  await expect(page.locator("#detail-dialog")).toBeVisible();
  await page.locator("[data-share-member]").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "ref=member-1",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail-dialog")).toHaveCount(0);
  await expect(page.locator(".profile-button").first()).toBeFocused();
  await page.locator("#home-catalog-link").click();
  await expect(page).toHaveURL(/\/products\?ref=member-1/);
  await expect(page.locator("#catalog-list .catalog-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(page.locator("#catalog-list .catalog-card")).toHaveCount(7);
  await expect(page).toHaveURL(/page=2/);
  await page.locator("#product-search").fill("so ghi chu");
  await expect(page.locator("#catalog-list .catalog-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#product-search")).toHaveValue("so ghi chu");
  await page.locator(".product-button").click();
  await expect(page.locator("h1")).toHaveText("Sổ ghi chú");
  await expect(page).toHaveURL(/ref=member-1/);
  await page
    .getByRole("link", { name: "Tư vấn mua sản phẩm", exact: false })
    .click();
  await expect(page.locator("#contact-product")).toHaveValue("example-2");
  await expect(page.locator("#contact-person")).toHaveValue("member-1");
  await page.locator("#contact-name").fill("Khách thử");
  await page.locator("#contact-email").fill("test@example.com");
  await page
    .locator("#contact-message")
    .fill("Tôi muốn hỏi tính năng sản phẩm");
  await page.locator(".form-submit").click();
  await expect(page.locator("#brief-dialog")).toBeVisible();
  await expect(page.locator("#brief-text")).toContainText(
    "Được giới thiệu bởi: Thành viên 01",
  );
  await page.locator("#copy-brief").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Tôi muốn hỏi",
  );
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("mobile and desktop keep approved layout; chat has icon-only launcher and separate drafts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?ref=member-1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("#team")).toHaveCSS(
      "background-color",
      "rgb(247, 249, 252)",
    );
    await expect(page.locator(".hero-actions a")).toHaveCount(1);
    if (width < 1024) {
      await page.locator(".menu-toggle").click();
      expect(
        await page.locator("main").evaluate((el) => (el as HTMLElement).inert),
      ).toBe(true);
      await page.keyboard.press("Escape");
    }
    const launcher = page.locator(".chat-launcher");
    await expect(launcher).toHaveText("");
    await launcher.click();
    await expect(page.locator(".chat-panel")).toBeVisible();
    const box = await page.locator(".chat-panel").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page
      .getByRole("button", { name: "Trải nghiệm demo", exact: true })
      .click();
    await expect(page.locator(".chat-messages")).toContainText("example.com");
    await page.locator("#chat-input").fill("Bản nháp AI");
    await page.getByRole("tab", { name: "Nhân viên", exact: true }).click();
    await page.locator("#chat-input").fill("<img src=x> Tôi cần tư vấn");
    await page.locator("#chat-input").press("Enter");
    await expect(page.locator(".chat-bubble img")).toHaveCount(0);
    await page.locator(".chat-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "Tôi cần tư vấn",
    );
    await page.getByRole("tab", { name: "AI hỗ trợ", exact: true }).click();
    await expect(page.locator("#chat-input")).toHaveValue("Bản nháp AI");
    await page.locator("#chat-input").fill("");
    if ([390, 1440].includes(width))
      await page.screenshot({ path: `artifacts/site-chat-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
    await launcher.click();
    await expect(page.locator(".chat-messages")).toContainText(
      "Trải nghiệm demo",
    );
    await page.locator(".chat-close").click();
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: `artifacts/site-home-${width}.png`,
        fullPage: true,
      });
  }
  expect(errors).toEqual([]);
});
