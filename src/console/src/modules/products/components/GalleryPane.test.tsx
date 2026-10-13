import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { GalleryPane } from "./GalleryPane";
import type { ProductMedia } from "../services/products.service";

const API = "http://localhost/api";
const PID = "p1";

function image(over: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id: "m1",
    kind: "image",
    url: "/api/files/products/p1/gallery-1.png",
    video_url: null,
    caption: "Màn hình chính",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function video(over: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id: "m2",
    kind: "video",
    url: null,
    video_url: "https://youtu.be/abc",
    caption: null,
    sort_order: 1,
    created_at: "2026-01-02T00:00:00Z",
    ...over,
  };
}

function renderPane(items: ProductMedia[], disabled = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <GalleryPane productId={PID} items={items} disabled={disabled} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("GalleryPane", () => {
  it("renders images and videos differently", async () => {
    renderPane([image(), video()]);
    const cards = screen.getAllByTestId("gallery-item");
    expect(cards).toHaveLength(2);
    // An image card shows the thumbnail itself; a video card has no image to
    // show, so it prints the URL.
    expect(cards[0].querySelector("img")).toHaveAttribute(
      "src",
      "/api/files/products/p1/gallery-1.png",
    );
    expect(cards[1].querySelector("img")).toBeNull();
    expect(
      within(cards[1]).getByText("https://youtu.be/abc"),
    ).toBeInTheDocument();
  });

  it("commits a caption on blur, not on every keystroke", async () => {
    const patched = vi.fn();
    server.use(
      http.patch(`${API}/products/${PID}/media/m1`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json(image({ caption: "Mới" }));
      }),
    );
    renderPane([image()]);

    const input = screen.getByLabelText(i18n.t("products.gallery.caption"));
    await userEvent.clear(input);
    await userEvent.type(input, "Mới");
    expect(patched).not.toHaveBeenCalled(); // still typing

    await userEvent.tab();
    await waitFor(() => expect(patched).toHaveBeenCalledTimes(1));
    expect(patched.mock.calls[0][0]).toMatchObject({ caption: "Mới" });
  });

  it("does not call the server when the caption is unchanged", async () => {
    const patched = vi.fn();
    server.use(
      http.patch(`${API}/products/${PID}/media/m1`, () => {
        patched();
        return HttpResponse.json(image());
      }),
    );
    renderPane([image()]);

    await userEvent.click(
      screen.getByLabelText(i18n.t("products.gallery.caption")),
    );
    await userEvent.tab();
    expect(patched).not.toHaveBeenCalled();
  });

  it("removes an item", async () => {
    const deleted = vi.fn();
    server.use(
      http.delete(`${API}/products/${PID}/media/m1`, () => {
        deleted();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPane([image()]);

    await userEvent.click(
      screen.getAllByRole("button", { name: i18n.t("common.remove") })[0],
    );
    await waitFor(() => expect(deleted).toHaveBeenCalled());
  });

  it("adds a video through the dialog and says which hosts are allowed", async () => {
    const posted = vi.fn();
    server.use(
      http.post(`${API}/products/${PID}/media/video`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(video(), { status: 201 });
      }),
    );
    renderPane([]);

    await userEvent.click(
      screen.getByRole("button", {
        name: i18n.t("products.gallery.add_video"),
      }),
    );
    expect(
      await screen.findByText(i18n.t("products.gallery.video_hosts")),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText(i18n.t("products.gallery.video_url")),
      "https://youtu.be/abc",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.add") }),
    );

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      video_url: "https://youtu.be/abc",
    });
  });

  it("hides every write affordance when read-only", () => {
    renderPane([image()], true);
    expect(
      screen.queryByRole("button", {
        name: i18n.t("products.gallery.add_image"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.remove") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: i18n.t("products.gallery.reorder"),
      }),
    ).not.toBeInTheDocument();
  });
});
