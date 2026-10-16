import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { GalleryPane, type GalleryDraftItem } from "./GalleryPane";
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

// The draft mode the editor drives before the product exists: the list lives
// outside the pane, so the test owns it exactly as ProductEditor does.
function DraftHarness() {
  const [draft, setDraft] = useState<GalleryDraftItem[]>([]);
  return (
    <GalleryPane
      productId={null}
      items={[]}
      draft={draft}
      onDraftChange={setDraft}
    />
  );
}

function renderDraft() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <DraftHarness />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

// The body is the marker: a jsdom File loses its filename on the way through
// MSW, but its bytes survive, so each file carries its own name as content.
const png = (name: string) =>
  new File([`#${name}#`], `${name}.png`, { type: "image/png" });

/** One text field of a raw multipart body. */
const part = (body: string, name: string) =>
  new RegExp(`name="${name}"\r?\n\r?\n([^\r\n]*)`).exec(body)?.[1] ?? "";

/** The "Tải ảnh lên" input — the only one that takes more than one file. */
const addInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("GalleryPane", () => {
  it("renders images and videos differently", async () => {
    renderPane([image(), video()]);
    const cards = screen.getAllByTestId("gallery-item");
    expect(cards).toHaveLength(2);
    // An image card shows the thumbnail itself; a video card has no image to
    // show, so it prints the URL. The stored URL is relative and belongs to
    // the API, so what reaches the `src` is resolved against the API's origin
    // (fileUrl) — otherwise the browser would ask the console for it.
    expect(cards[0].querySelector("img")).toHaveAttribute(
      "src",
      "http://localhost/api/files/products/p1/gallery-1.png",
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

  it("uploads every picked file, one at a time", async () => {
    const log: string[] = [];
    let n = 0;
    server.use(
      http.post(`${API}/products/${PID}/media`, async () => {
        const i = ++n;
        log.push(`start${i}`);
        await new Promise((done) => setTimeout(done, 10));
        log.push(`end${i}`);
        return HttpResponse.json(image({ id: `m${i}` }), { status: 201 });
      }),
    );
    renderPane([]);

    await userEvent.upload(addInput(), [png("a"), png("b"), png("c")]);

    // The server stamps sort_order from arrival, so three parallel uploads
    // would land in whatever order they happened to finish. Each request
    // therefore waits for the one before it.
    await waitFor(() => expect(log).toHaveLength(6));
    expect(log).toEqual(["start1", "end1", "start2", "end2", "start3", "end3"]);
  });

  it("keeps several files picked before the product exists, in order", async () => {
    // jsdom has no object URLs; the preview src is the only place they show.
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (blob) => `blob:${(blob as File).name}`,
    );
    renderDraft();

    await userEvent.upload(addInput(), [png("một"), png("hai")]);

    const cards = await screen.findAllByTestId("gallery-item");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("img")).toHaveAttribute(
      "src",
      "blob:một.png",
    );
    expect(cards[1].querySelector("img")).toHaveAttribute(
      "src",
      "blob:hai.png",
    );
  });

  it("replaces one image in place, keeping its caption and its neighbours", async () => {
    const posted: string[] = [];
    const deleted: string[] = [];
    let ordered: string[] = [];
    server.use(
      http.post(`${API}/products/${PID}/media`, async ({ request }) => {
        posted.push(part(await request.text(), "caption"));
        return HttpResponse.json(image({ id: "m3" }), { status: 201 });
      }),
      http.delete(`${API}/products/${PID}/media/:mediaId`, ({ params }) => {
        deleted.push(String(params.mediaId));
        return new HttpResponse(null, { status: 204 });
      }),
      http.put(`${API}/products/${PID}/media/order`, async ({ request }) => {
        ordered = ((await request.json()) as { ids: string[] }).ids;
        return HttpResponse.json({ items: [] });
      }),
    );
    renderPane([image(), video()]);

    const card = screen.getAllByTestId("gallery-item")[0];
    // The visible control is the button; it opens the card's own file input,
    // which is what a file can be handed to here.
    expect(
      within(card).getByRole("button", {
        name: i18n.t("products.gallery.replace"),
      }),
    ).toBeInTheDocument();
    await userEvent.upload(
      card.querySelector('input[type="file"]')!,
      png("new"),
    );

    // The caption rides along with the new file, only the replaced entry is
    // deleted, and the reorder puts the newcomer back in slot 0 — the video
    // next to it does not move.
    await waitFor(() => expect(ordered).toEqual(["m3", "m2"]));
    expect(posted).toEqual(["Màn hình chính"]);
    expect(deleted).toEqual(["m1"]);
  });

  it("removes only the item whose bin was clicked", async () => {
    const deleted: string[] = [];
    server.use(
      http.delete(`${API}/products/${PID}/media/:mediaId`, ({ params }) => {
        deleted.push(String(params.mediaId));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPane([image(), video()]);

    const cards = screen.getAllByTestId("gallery-item");
    await userEvent.click(
      within(cards[1]).getByRole("button", { name: i18n.t("common.remove") }),
    );
    await waitFor(() => expect(deleted).toEqual(["m2"]));
  });

  it("plays a linked video in a dialog", async () => {
    renderPane([video()]);

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("products.gallery.preview") }),
    );
    const dialog = await screen.findByRole("dialog");
    const frame = within(dialog).getByTitle(i18n.t("products.gallery.preview"));
    // youtu.be/abc is a watch link; only the player path renders in an iframe.
    expect(frame).toHaveAttribute("src", "https://www.youtube.com/embed/abc");
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
