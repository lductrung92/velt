import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import type { ImageUploadValue } from "@/components/common/ImageHandler";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { UnsavedChangesProvider } from "@/app/UnsavedChangesProvider";

import ArticleEditor from "./ArticleEditor";

// Tiptap/ProseMirror doesn't run in jsdom — swap the editor for a textarea that
// drives onChange(html, json). ImageHandler is stubbed (no image interaction here).
vi.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string, json: unknown) => void;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value, { type: "doc" })}
    />
  ),
}));
vi.mock("@/components/common/ImageHandler", () => ({
  ImageUpload: ({
    value,
    onChange,
  }: {
    value: ImageUploadValue;
    onChange: (value: ImageUploadValue) => void;
  }) => (
    <button
      type="button"
      data-testid="image-upload"
      data-value={value.kind}
      onClick={() =>
        onChange({
          kind: "pending",
          dataUrl: "data:image/png;base64,aGVsbG8=",
          blob: new Blob(["fixture"], { type: "image/png" }),
        })
      }
    >
      {"Choose fixture image"}
    </button>
  ),
}));

const API = "http://localhost/api";

function settingsView(over: Record<string, boolean> = {}) {
  const flags = {
    "cms.article.categorize": false,
    "cms.article.allow_slug_edit": true,
    "cms.article.require_review": true,
    "cms.publish.allow_now": true,
    ...over,
  };
  return {
    cms: Object.entries(flags).map(([key, value]) => ({
      key,
      type: "bool",
      value,
    })),
  };
}

function fullArticle(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: "Old title",
    slug: "old-title",
    status: "draft",
    category: null,
    author: { id: "u1", name: "Alice" },
    published_at: null,
    updated_at: "u-1",
    excerpt: "",
    body_html: "<p>Body</p>",
    body_json: { type: "doc" },
    tags: [],
    featured_url: null,
    og_url: null,
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
    review_note: null,
    author_role: "editor",
    published_snapshot: null,
    created_at: "x",
    ...over,
  };
}

function baseHandlers() {
  return [
    http.get(`${API}/cms/settings`, () => HttpResponse.json(settingsView())),
    http.get(`${API}/cms/categories`, () => HttpResponse.json([])),
  ];
}

function signIn(permissions: string[]) {
  useAuthStore.getState().setSession(
    {
      id: "admin-1",
      email: "admin@velt.local.vn",
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

/**
 * A DATA router, not <MemoryRouter>. The unsaved-changes prompt is driven by
 * `useBlocker`, which only exists on a data router — on a plain MemoryRouter
 * every navigation sails through and the guard silently tests nothing. The
 * list route is real so Back has somewhere to go.
 */
function renderEditor(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: (
          <UnsavedChangesProvider>
            <Outlet />
          </UnsavedChangesProvider>
        ),
        children: [
          { path: "/cms/articles", element: <div>danh sách</div> },
          { path: "/cms/articles/new", element: <ArticleEditor /> },
          { path: "/cms/articles/:id", element: <ArticleEditor /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = [
  "cms.article.view",
  "cms.article.create",
  "cms.article.edit",
  "cms.article.delete",
  "cms.article.review",
];
const BODY = () => i18n.t("cms.articles.field.body");
const SAVE = () => i18n.t("common.save");

beforeEach(() => {
  useAuthStore.getState().clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  useAuthStore.getState().clear();
  vi.restoreAllMocks();
});

describe("ArticleEditor", () => {
  it("create: POST with title, status and body", async () => {
    signIn(MANAGER);
    let postBody: Record<string, unknown> | undefined;
    server.use(
      ...baseHandlers(),
      http.post(`${API}/cms/articles`, async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(fullArticle("new1"), { status: 201 });
      }),
      http.get(`${API}/cms/articles/new1`, () =>
        HttpResponse.json(fullArticle("new1")),
      ),
    );
    const user = userEvent.setup();
    renderEditor("/cms/articles/new");

    // Wait for the lazy editor to mount, then the title is the first textbox.
    const body = await screen.findByRole("textbox", { name: BODY() });
    await user.type(screen.getAllByRole("textbox")[0], "Hello world");
    await user.type(body, "My body");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    await waitFor(() =>
      expect(postBody).toMatchObject({
        title: "Hello world",
        status: "draft",
        body_html: "My body",
      }),
    );
  });

  it("edit: prefilled, PATCH carries the optimistic-lock updated_at", async () => {
    signIn(MANAGER);
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      ...baseHandlers(),
      http.get(`${API}/cms/articles/a1`, () =>
        HttpResponse.json(fullArticle("a1")),
      ),
      http.patch(`${API}/cms/articles/a1`, async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(fullArticle("a1"));
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/articles/a1");

    const title = await screen.findByDisplayValue("Old title");
    await user.clear(title);
    await user.type(title, "Fresh title");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    await waitFor(() =>
      expect(patchBody).toMatchObject({
        title: "Fresh title",
        updated_at: "u-1",
      }),
    );
  });

  it("validation: empty title blocks submit", async () => {
    signIn(MANAGER);
    let posted = false;
    server.use(
      ...baseHandlers(),
      http.post(`${API}/cms/articles`, () => {
        posted = true;
        return HttpResponse.json(fullArticle("x"), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/articles/new");

    // Body filled, title left empty.
    await user.type(
      await screen.findByRole("textbox", { name: BODY() }),
      "Some content",
    );
    await user.click(screen.getByRole("button", { name: SAVE() }));

    expect(
      await screen.findByText(i18n.t("errors.validation.required")),
    ).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("read-only: an editor viewing a published article gets no Save and disabled fields", async () => {
    signIn(["cms.article.view", "cms.article.edit"]); // no review → editor
    server.use(
      ...baseHandlers(),
      http.get(`${API}/cms/articles/a1`, () =>
        HttpResponse.json(fullArticle("a1", { status: "published" })),
      ),
    );
    renderEditor("/cms/articles/a1");

    const title = await screen.findByDisplayValue("Old title");
    expect(
      screen.queryByRole("button", { name: SAVE() }),
    ).not.toBeInTheDocument();
    expect(title).toBeDisabled();
  });

  it("status select shows the current status even when it's outside the assignable set", async () => {
    // Editor (no review) opening their needs_revision article: 'needs_revision'
    // isn't an editor-assignable status, but the select must still display it
    // (regression: it used to render blank).
    signIn(["cms.article.view", "cms.article.edit"]);
    server.use(
      ...baseHandlers(),
      http.get(`${API}/cms/articles/a1`, () =>
        HttpResponse.json(
          fullArticle("a1", {
            status: "needs_revision",
            author_role: "editor",
          }),
        ),
      ),
    );
    renderEditor("/cms/articles/a1");

    await screen.findByDisplayValue("Old title");
    const statusTrigger = document.getElementById("cms-article-status");
    expect(statusTrigger).toHaveTextContent(
      i18n.t("content_status.needs_revision"),
    );
  });

  it("slug conflict: 422 surfaces inline on the slug field", async () => {
    signIn(MANAGER);
    server.use(
      ...baseHandlers(),
      http.post(`${API}/cms/articles`, () =>
        HttpResponse.json(
          { error: { code: 422, message: "slug_already_exists" } },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderEditor("/cms/articles/new");

    const body = await screen.findByRole("textbox", { name: BODY() });
    await user.type(screen.getAllByRole("textbox")[0], "Dup");
    await user.type(body, "Body");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    // Surfaces inline on the slug field (and also as a toast) → at least one node.
    expect(
      (await screen.findAllByText(i18n.t("errors.slug_already_exists"))).length,
    ).toBeGreaterThan(0);
  });

  it("Back asks before discarding content and cancel keeps the draft", async () => {
    signIn(MANAGER);
    server.use(...baseHandlers());
    renderEditor("/cms/articles/new");
    await screen.findByRole("textbox", { name: BODY() });
    const user = userEvent.setup();
    const title = screen.getByPlaceholderText(
      i18n.t("cms.articles.editor.title_ph"),
    );
    await user.type(title, "Keep this draft");
    await user.click(
      screen.getByRole("button", { name: i18n.t("common.back") }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: i18n.t("common.cancel") }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(title).toHaveValue("Keep this draft");
  });

  it("SEO-only checkbox changes are protected by the unsaved Back prompt", async () => {
    signIn(MANAGER);
    server.use(...baseHandlers());
    renderEditor("/cms/articles/new");
    await screen.findByRole("textbox", { name: BODY() });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("checkbox", {
        name: i18n.t("cms.articles.seo.noindex"),
      }),
    );
    await user.click(
      screen.getByRole("button", { name: i18n.t("common.back") }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("cover-only changes are protected and cancel keeps the pending image", async () => {
    signIn(MANAGER);
    server.use(...baseHandlers());
    renderEditor("/cms/articles/new");
    await screen.findByRole("textbox", { name: BODY() });
    const user = userEvent.setup();
    await user.click(screen.getAllByTestId("image-upload")[0]);
    await user.click(
      screen.getByRole("button", { name: i18n.t("common.back") }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: i18n.t("common.cancel") }),
    );
    expect(screen.getAllByTestId("image-upload")[0]).toHaveAttribute(
      "data-value",
      "pending",
    );
  });
});
