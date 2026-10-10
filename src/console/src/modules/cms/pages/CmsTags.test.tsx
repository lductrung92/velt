import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import CmsTags from "./CmsTags";

const API = "http://localhost/api";

function tagsList() {
  return [
    {
      id: "t1",
      name: "Golang",
      slug: "golang",
      usage_count: 3,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "t2",
      name: "Rust",
      slug: "rust",
      usage_count: 0,
      created_at: "2026-01-02T00:00:00Z",
    },
  ];
}

// GET /cms/tags is server-paginated → envelope. /cms/tags/options (merge picker)
// returns the flat list.
function tagsPage() {
  const items = tagsList();
  return { items, total: items.length, page: 1, page_size: 10 };
}

// The tag form reads cms.article.allow_slug_edit to decide whether to show the
// slug input (only while the dialog is open).
function cmsSettingsView(allowSlugEdit = true) {
  return {
    cms: [
      {
        key: "cms.article.allow_slug_edit",
        type: "bool",
        value: allowSlugEdit,
      },
    ],
  };
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/cms/tags"]}>
          <CmsTags />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["cms.article.view", "cms.taxonomy.manage"];
const ADD = () => i18n.t("common.add_new");
const SAVE = () => i18n.t("common.save");

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("CmsTags", () => {
  it("loads the tag list with name/slug/usage", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
    );
    renderPage();

    expect(await screen.findByText("Golang")).toBeInTheDocument();
    expect(screen.getByText("rust")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sort: clicking a header cycles asc → desc and sends the sort param", async () => {
    signIn(MANAGER);
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${API}/cms/tags`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return HttpResponse.json(tagsPage());
      }),
      http.get(`${API}/cms/tags/options`, () => HttpResponse.json(tagsList())),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    const nameLabel = i18n.t("cms.tags.col.name");
    // The sort header re-renders per click — re-query the button each time.
    await user.click(screen.getByRole("button", { name: nameLabel }));
    await waitFor(() => expect(sorts.at(-1)).toBe("name"));
    expect(
      screen.getByRole("columnheader", { name: nameLabel }),
    ).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: nameLabel }));
    await waitFor(() => expect(sorts.at(-1)).toBe("-name"));
    expect(
      screen.getByRole("columnheader", { name: nameLabel }),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("read-only viewer: no Add button and no row actions", async () => {
    signIn(["cms.article.view"]);
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
    );
    renderPage();

    await screen.findByText("Golang");
    expect(
      screen.queryByRole("button", { name: ADD() }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.edit") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.delete") }),
    ).not.toBeInTheDocument();
  });

  it("create: Add new → dialog → POST { name }", async () => {
    signIn(MANAGER);
    let postBody: unknown;
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
      http.get(`${API}/cms/settings`, () =>
        HttpResponse.json(cmsSettingsView()),
      ),
      http.post(`${API}/cms/tags`, async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json(
          {
            id: "t3",
            name: "News",
            slug: "news",
            usage_count: 0,
            created_at: "x",
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    await user.click(screen.getByRole("button", { name: ADD() }));
    const dialog = await screen.findByRole("dialog");
    // First textbox in the dialog is the name field, second is slug.
    await user.type(within(dialog).getAllByRole("textbox")[0], "News");
    await user.click(within(dialog).getByRole("button", { name: SAVE() }));

    await waitFor(() => expect(postBody).toEqual({ name: "News" }));
  });

  it("edit: Pencil → dialog prefilled → PATCH with new name", async () => {
    signIn(MANAGER);
    let patchBody: unknown;
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
      http.get(`${API}/cms/settings`, () =>
        HttpResponse.json(cmsSettingsView()),
      ),
      http.patch(`${API}/cms/tags/t1`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          id: "t1",
          name: "Go",
          slug: "golang",
          usage_count: 3,
          created_at: "x",
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    // First row's edit (Pencil) button.
    await user.click(
      screen.getAllByRole("button", { name: i18n.t("common.edit") })[0],
    );
    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByDisplayValue("Golang");
    await user.clear(nameInput);
    await user.type(nameInput, "Go");
    await user.click(within(dialog).getByRole("button", { name: SAVE() }));

    await waitFor(() =>
      expect((patchBody as { name: string }).name).toBe("Go"),
    );
  });

  it("create slug conflict: dialog stays open + error shown inline on slug", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
      http.get(`${API}/cms/settings`, () =>
        HttpResponse.json(cmsSettingsView()),
      ),
      http.post(`${API}/cms/tags`, () =>
        HttpResponse.json(
          { error: { code: 422, message: "slug_already_exists" } },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    await user.click(screen.getByRole("button", { name: ADD() }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Dup");
    await user.type(within(dialog).getAllByRole("textbox")[1], "rust");
    await user.click(within(dialog).getByRole("button", { name: SAVE() }));

    // slug_already_exists surfaces inline on the slug field (not just a toast).
    expect(
      await within(dialog).findByText(i18n.t("errors.slug_already_exists")),
    ).toBeInTheDocument();
    // Save button still present → dialog stayed open (error not swallowed).
    expect(within(dialog).getByRole("button", { name: SAVE() })).toBeEnabled();
  });

  it("OFF + edit: regenerate checkbox sends regenerate_slug, no slug field", async () => {
    signIn(MANAGER);
    let patchBody: unknown;
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
      http.get(`${API}/cms/settings`, () =>
        HttpResponse.json(cmsSettingsView(false)),
      ),
      http.patch(`${API}/cms/tags/t1`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          id: "t1",
          name: "Golang",
          slug: "golang-01",
          usage_count: 3,
          created_at: "x",
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    await user.click(
      screen.getAllByRole("button", { name: i18n.t("common.edit") })[0],
    );
    const dialog = await screen.findByRole("dialog");
    const checkbox = await within(dialog).findByRole("checkbox");
    await user.click(checkbox);
    await user.click(within(dialog).getByRole("button", { name: SAVE() }));

    await waitFor(() =>
      expect(patchBody).toEqual({ name: "Golang", regenerate_slug: true }),
    );
  });

  it("hides the slug input when allow_slug_edit is off", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
      http.get(`${API}/cms/settings`, () =>
        HttpResponse.json(cmsSettingsView(false)),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    await user.click(screen.getByRole("button", { name: ADD() }));
    const dialog = await screen.findByRole("dialog");
    // Once the flag loads (off) only the name field remains.
    await waitFor(() =>
      expect(within(dialog).getAllByRole("textbox")).toHaveLength(1),
    );
  });

  it("delete: row action → ConfirmDialog → DELETE", async () => {
    signIn(MANAGER);
    let deleted = false;
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
      http.delete(`${API}/cms/tags/t1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    const deleteLabel = i18n.t("common.delete");
    await user.click(screen.getAllByRole("button", { name: deleteLabel })[0]);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: deleteLabel }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("merge: row action → dialog, confirm disabled until target chosen", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/tags`, () => HttpResponse.json(tagsPage())),
      http.get(`${API}/cms/tags/options`, () =>
        HttpResponse.json(tagsList()),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Golang");

    await user.click(
      screen.getAllByRole("button", { name: i18n.t("cms.tags.btn.merge") })[0],
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", {
        name: i18n.t("cms.tags.btn.merge"),
      }),
    ).toBeDisabled();
  });
});
