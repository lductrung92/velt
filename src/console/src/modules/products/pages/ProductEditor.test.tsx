import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import ProductEditor from "./ProductEditor";

const API = "http://localhost/api";

// The category chips and the member picker both render from the first paint
// now, so every test needs their lists stubbed.
function stubLists() {
  return [
    http.get(`${API}/product-categories`, () =>
      HttpResponse.json({ items: [] }),
    ),
    http.get(`${API}/members`, () =>
      HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100 }),
    ),
  ];
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    slug: "bang-cong-viec",
    name: "Bảng công việc",
    summary: "Không gian sắp xếp công việc.",
    body_html: "<p>Giới thiệu</p>",
    body_json: null,
    cover_url: null,
    cover_path: null,
    status: "draft",
    lifecycle: "building",
    version: "0.9.0",
    released_at: "2026-03-01",
    audience: ["team"],
    platforms: ["web"],
    tech_stack: ["Go"],
    highlights: ["Đồng bộ thời gian thực"],
    is_featured: false,
    sort_order: 0,
    product_url: null,
    demo_url: null,
    demo_access: null,
    demo_instructions: [],
    seo: {
      title: null,
      description: null,
      keywords: null,
      canonical_url: null,
      noindex: false,
      nofollow: false,
      og_title: null,
      og_description: null,
    },
    // The server always sends these (possibly empty), never omits them.
    categories: [],
    members: [],
    gallery: [],
    published_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function signIn(permissions: string[]) {
  useAuthStore.getState().setSession(
    {
      id: "admin-1",
      email: "admin@velt.local",
      full_name: "Admin",
      avatar_url: null,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    },
    "tok",
  );
  useAuthStore.getState().setAuthz(["admin"], permissions);
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {/* The list is a marker: deleting a product lands on it. */}
            <Route path="/products" element={<p>danh sách</p>} />
            <Route path="/products/new" element={<ProductEditor />} />
            <Route path="/products/:id" element={<ProductEditor />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const AUTHOR = ["products.view", "products.create", "products.edit"];
const PUBLISHER = [...AUTHOR, "products.publish"];

beforeEach(() => {
  useAuthStore.getState().clear();
  // Registered here, not in renderAt: MSW lets the most recent handler win, and
  // renderAt runs after a test's own server.use() calls.
  server.use(...stubLists());
});
afterEach(() => useAuthStore.getState().clear());

describe("ProductEditor", () => {
  it("renders every card on the shared editor chrome", async () => {
    signIn(AUTHOR);
    const { container } = renderAt("/products/new");

    // One heading each now the nav rail is gone: the cards themselves are the
    // map of the screen.
    for (const key of [
      "content",
      "details",
      "gallery",
      "people",
      "demo",
      "seo",
    ]) {
      expect(
        await screen.findAllByText(i18n.t(`products.editor.${key}`)),
      ).toHaveLength(1);
    }
    // The three grid areas the shared chrome lays out.
    expect(container.querySelector(".editor-main")).not.toBeNull();
    expect(container.querySelector(".editor-side")).not.toBeNull();
    expect(container.querySelector(".editor-wide#prod-seo")).not.toBeNull();
  });

  it("lets a brand-new product be filled in before it is saved", async () => {
    // Nothing here needs a product id until Save, so none of it is gated.
    signIn(AUTHOR);
    const { container } = renderAt("/products/new");

    await screen.findByLabelText(/Tên sản phẩm/);
    // Scoped: the gallery has its own upload button with the same label.
    const side = container.querySelector(".editor-side") as HTMLElement;
    expect(
      within(side).getByRole("button", {
        name: i18n.t("image.upload.trigger"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: i18n.t("products.gallery.add_video"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: i18n.t("products.members.add") }),
    ).toBeInTheDocument();
  });

  it("holds a gallery video locally and only sends it after the product exists", async () => {
    signIn(AUTHOR);
    const posted = vi.fn();
    const addedVideo = vi.fn();
    server.use(
      http.post(`${API}/products`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(product(), { status: 201 });
      }),
      http.post(`${API}/products/p1/media/video`, async ({ request }) => {
        addedVideo(await request.json());
        return HttpResponse.json({}, { status: 201 });
      }),
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
    );
    renderAt("/products/new");

    await userEvent.type(await screen.findByLabelText(/Tên sản phẩm/), "Test");
    await userEvent.click(
      screen.getByRole("button", {
        name: i18n.t("products.gallery.add_video"),
      }),
    );
    await userEvent.type(
      await screen.findByLabelText(i18n.t("products.gallery.video_url")),
      "https://youtu.be/abc",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.add") }),
    );

    // Still a draft: the product does not exist, so nothing was sent.
    expect(await screen.findByTestId("gallery-item")).toBeInTheDocument();
    expect(addedVideo).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );
    await waitFor(() => expect(posted).toHaveBeenCalled());
    await waitFor(() => expect(addedVideo).toHaveBeenCalled());
    expect(addedVideo.mock.calls[0][0]).toMatchObject({
      video_url: "https://youtu.be/abc",
    });
  });

  it("attaches categories picked before the first save", async () => {
    signIn(AUTHOR);
    const setCats = vi.fn();
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({
          items: [
            {
              id: "c1",
              slug: "cong-tac",
              name: "Cộng tác",
              description: null,
              sort_order: 0,
              product_count: 0,
              seo: { title: null, description: null, keywords: null },
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      ),
      http.post(`${API}/products`, () =>
        HttpResponse.json(product(), { status: 201 }),
      ),
      http.put(`${API}/products/p1/categories`, async ({ request }) => {
        setCats(await request.json());
        return HttpResponse.json(product());
      }),
      http.put(`${API}/products/p1/members`, () =>
        HttpResponse.json(product()),
      ),
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
    );
    renderAt("/products/new");

    await userEvent.type(await screen.findByLabelText(/Tên sản phẩm/), "Test");
    await userEvent.click(
      await screen.findByRole("button", { name: "Cộng tác" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(setCats).toHaveBeenCalled());
    expect(setCats.mock.calls[0][0]).toMatchObject({ category_ids: ["c1"] });
  });

  it("requires a name", async () => {
    signIn(AUTHOR);
    const posted = vi.fn();
    server.use(
      http.post(`${API}/products`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(product(), { status: 201 });
      }),
    );
    renderAt("/products/new");

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("common.save") }),
    );
    expect(
      await screen.findByText(i18n.t("errors.validation.required")),
    ).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("refuses a javascript: demo link before it reaches the server", async () => {
    signIn(AUTHOR);
    const posted = vi.fn();
    server.use(
      http.post(`${API}/products`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(product(), { status: 201 });
      }),
    );
    renderAt("/products/new");

    await userEvent.type(await screen.findByLabelText(/Tên sản phẩm/), "Test");
    await userEvent.type(
      screen.getByLabelText(i18n.t("products.field.demo_url")),
      "javascript:alert(1)",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    expect(
      await screen.findByText(i18n.t("errors.validation.invalid_url")),
    ).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("loads an existing product into the form", async () => {
    signIn(AUTHOR);
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
    );
    renderAt("/products/p1");

    await waitFor(async () =>
      expect(await screen.findByLabelText(/Tên sản phẩm/)).toHaveValue(
        "Bảng công việc",
      ),
    );
    // The saved address is a locked row, not an input.
    expect(screen.getByText("bang-cong-viec")).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t("products.col.version"))).toHaveValue(
      "0.9.0",
    );
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("offers no permalink before the product exists", async () => {
    // The server derives the slug from the name, so there is nothing to show
    // and nothing to send.
    signIn(AUTHOR);
    renderAt("/products/new");

    await screen.findByLabelText(/Tên sản phẩm/);
    expect(
      screen.queryByText(i18n.t("products.editor.permalink")),
    ).not.toBeInTheDocument();
  });

  it("sends the slug only once it has been changed", async () => {
    signIn(AUTHOR);
    const patched = vi.fn();
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
      http.patch(`${API}/products/p1`, async ({ request }) => {
        const body = await request.json();
        patched(body);
        return HttpResponse.json({ ...product(), ...(body as object) });
      }),
    );
    renderAt("/products/p1");

    await screen.findByText("bang-cong-viec");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );
    await waitFor(() => expect(patched).toHaveBeenCalled());
    expect(patched.mock.calls[0][0]).not.toHaveProperty("slug");

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.edit") }),
    );
    const slug = screen.getByDisplayValue("bang-cong-viec");
    await userEvent.clear(slug);
    await userEvent.type(slug, "bang-viec");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(patched).toHaveBeenCalledTimes(2));
    expect(patched.mock.calls[1][0]).toMatchObject({ slug: "bang-viec" });
  });

  it("sends the removal when the cover is taken off", async () => {
    // The PATCH has to SAY the cover is gone: a field left out means "I did
    // not touch it", so the stored path survives and the image comes back.
    signIn(AUTHOR);
    const patched = vi.fn();
    server.use(
      http.get(`${API}/products/p1`, () =>
        HttpResponse.json(
          product({ cover_url: "/api/files/products/p1/cover-1.png" }),
        ),
      ),
      http.patch(`${API}/products/p1`, async ({ request }) => {
        const body = await request.json();
        patched(body);
        return HttpResponse.json({ ...product(), ...(body as object) });
      }),
    );
    renderAt("/products/p1");

    await screen.findByText("bang-cong-viec");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("image.upload.remove") }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(patched).toHaveBeenCalled());
    expect(patched.mock.calls[0][0]).toMatchObject({ cover_path: "" });
  });

  it("stores a translation before the product write, so one Save publishes it", async () => {
    signIn(AUTHOR);
    const calls: string[] = [];
    server.use(
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({
          "translation.enabled": true,
          "translation.locales": "en",
        }),
      ),
      http.get(`${API}/translations/product/p1`, () =>
        HttpResponse.json({
          entity: "product",
          entity_id: "p1",
          base_locale: "vi",
          locales: ["en"],
          translatable_fields: ["slug", "name", "summary", "body_html", "seo"],
          translations: {},
          requires_republish: false,
        }),
      ),
      http.put(`${API}/translations/product/p1/en`, () => {
        calls.push("translation");
        return HttpResponse.json({});
      }),
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
      http.patch(`${API}/products/p1`, () => {
        calls.push("product");
        return HttpResponse.json(product());
      }),
    );
    renderAt("/products/p1");

    await userEvent.click(await screen.findByRole("tab", { name: /English/ }));
    await userEvent.type(
      await screen.findByLabelText(i18n.t("products.col.name", { lng: "en" })),
      "Task board",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(calls).toEqual(["translation", "product"]));
  });

  it("marks the selected audience and platform chips as pressed", async () => {
    signIn(AUTHOR);
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
    );
    renderAt("/products/p1");

    await screen.findByLabelText(/Tên sản phẩm/);
    expect(
      screen.getByRole("button", { name: i18n.t("products.audience.team") }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: i18n.t("products.audience.individual"),
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: i18n.t("products.platform.web") }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the status select from an author without products.publish", async () => {
    // Authoring and publishing are separate permissions on purpose.
    signIn(AUTHOR);
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
    );
    renderAt("/products/p1");

    await screen.findByLabelText(/Tên sản phẩm/);
    expect(
      screen.queryByRole("combobox", { name: i18n.t("products.col.status") }),
    ).not.toBeInTheDocument();
  });

  it("applies the status picked in the select when Save is pressed", async () => {
    signIn(PUBLISHER);
    const calls: string[] = [];
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
      http.patch(`${API}/products/p1`, async ({ request }) => {
        calls.push("patch");
        return HttpResponse.json({
          ...product(),
          ...((await request.json()) as object),
        });
      }),
      http.post(`${API}/products/p1/publish`, () => {
        calls.push("publish");
        return HttpResponse.json(product({ status: "published" }));
      }),
    );
    renderAt("/products/p1");

    await screen.findByLabelText(/Tên sản phẩm/);
    await userEvent.click(
      screen.getByRole("combobox", { name: i18n.t("products.col.status") }),
    );
    await userEvent.click(
      await screen.findByRole("option", {
        name: i18n.t("products.status.published"),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    // The snapshot the publish freezes has to contain the fields just saved,
    // so the status moves AFTER the product write, never before it.
    await waitFor(() => expect(calls).toEqual(["patch", "publish"]));
  });

  it("leaves the status alone when the select was not touched", async () => {
    signIn(PUBLISHER);
    const patched = vi.fn();
    const published = vi.fn();
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
      http.patch(`${API}/products/p1`, () => {
        patched();
        return HttpResponse.json(product());
      }),
      http.post(`${API}/products/p1/unpublish`, () => {
        published();
        return HttpResponse.json(product());
      }),
    );
    renderAt("/products/p1");

    await screen.findByLabelText(/Tên sản phẩm/);
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );
    await waitFor(() => expect(patched).toHaveBeenCalled());
    // A draft saved as a draft must not go near /unpublish: the endpoint
    // answers 409 for a status that is already set.
    expect(published).not.toHaveBeenCalled();
  });

  it("offers no delete before the product exists", async () => {
    signIn([...AUTHOR, "products.delete"]);
    renderAt("/products/new");

    await screen.findByLabelText(/Tên sản phẩm/);
    expect(
      screen.queryByRole("button", { name: i18n.t("common.delete") }),
    ).not.toBeInTheDocument();
  });

  it("hides delete from someone without products.delete", async () => {
    signIn(AUTHOR);
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
    );
    renderAt("/products/p1");

    await screen.findByLabelText(/Tên sản phẩm/);
    expect(
      screen.queryByRole("button", { name: i18n.t("common.delete") }),
    ).not.toBeInTheDocument();
  });

  it("deletes after a confirmation and goes back to the list", async () => {
    signIn([...AUTHOR, "products.delete"]);
    const deleted = vi.fn();
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
      http.delete(`${API}/products/p1`, () => {
        deleted();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt("/products/p1");

    await screen.findByLabelText(/Tên sản phẩm/);
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.delete") }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(i18n.t("products.delete.title")),
    ).toBeInTheDocument();
    expect(deleted).not.toHaveBeenCalled(); // the prompt alone deletes nothing

    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("common.delete") }),
    );
    await waitFor(() => expect(deleted).toHaveBeenCalled());
    expect(await screen.findByText("danh sách")).toBeInTheDocument();
  });

  it("sends the edited fields and the seo block on save", async () => {
    signIn(AUTHOR);
    const patched = vi.fn();
    server.use(
      http.get(`${API}/products/p1`, () => HttpResponse.json(product())),
      http.patch(`${API}/products/p1`, async ({ request }) => {
        const body = await request.json();
        patched(body);
        return HttpResponse.json({ ...product(), ...(body as object) });
      }),
    );
    renderAt("/products/p1");

    const version = await screen.findByLabelText(
      i18n.t("products.col.version"),
    );
    await userEvent.clear(version);
    await userEvent.type(version, "1.0.0");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(patched).toHaveBeenCalled());
    const body = patched.mock.calls[0][0];
    expect(body).toMatchObject({ version: "1.0.0", lifecycle: "building" });
    expect(body).toHaveProperty("seo");
    expect(body).not.toHaveProperty("status", "published");
  });
});
