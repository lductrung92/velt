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
    device: "phone",
    is_hero: false,
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
    device: "phone",
    is_hero: false,
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

  it("shows one device's entries at a time, and counts the rest", async () => {
    renderPane([
      image({ id: "m1", device: "phone" }),
      image({ id: "m2", device: "desktop" }),
      image({ id: "m3", device: "desktop" }),
    ]);
    // The phone tab opens first, so only its one entry is on screen.
    expect(screen.getAllByTestId("gallery-item")).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("tab", { name: /Desktop/ }),
    );
    expect(screen.getAllByTestId("gallery-item")).toHaveLength(2);

    // A tab with nothing in it says so rather than showing a bare toolbar.
    await userEvent.click(screen.getByRole("tab", { name: /Máy tính bảng/ }));
    expect(screen.queryAllByTestId("gallery-item")).toHaveLength(0);
    expect(
      screen.getByText(i18n.t("products.gallery.empty_tab")),
    ).toBeInTheDocument();
  });

  it("offers the unsorted tab only while something is unsorted", async () => {
    const { unmount } = renderPane([image({ device: null })]);
    const unsorted = screen.getByRole("tab", { name: /Chưa gán/ });
    expect(unsorted).toBeInTheDocument();
    unmount();

    renderPane([image({ device: "phone" })]);
    expect(screen.queryByRole("tab", { name: /Chưa gán/ })).toBeNull();
  });

  it("moves an entry to another device, keeping its caption", async () => {
    const patched = vi.fn();
    server.use(
      http.patch(`${API}/products/${PID}/media/m1`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json(image({ device: "tablet" }));
      }),
    );
    renderPane([image({ caption: "Màn hình chính", device: "phone" })]);

    await userEvent.click(
      screen.getByRole("button", {
        name: i18n.t("products.gallery.device_tablet"),
      }),
    );
    await waitFor(() => expect(patched).toHaveBeenCalledTimes(1));
    // The whole editable state travels, or the API would clear the caption.
    expect(patched.mock.calls[0][0]).toEqual({
      caption: "Màn hình chính",
      device: "tablet",
    });
  });

  it("files an upload under the tab it was dropped into", async () => {
    const bodies: string[] = [];
    server.use(
      http.post(`${API}/products/${PID}/media`, async ({ request }) => {
        bodies.push(await request.text());
        return HttpResponse.json(image({ id: `m${bodies.length}` }), {
          status: 201,
        });
      }),
    );
    renderPane([image({ device: "phone" })]);

    await userEvent.click(screen.getByRole("tab", { name: /Desktop/ }));
    await userEvent.upload(addInput(), [png("a")]);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(part(bodies[0], "device")).toBe("desktop");
  });

  it("sends no device while the unsorted tab is open", async () => {
    const bodies: string[] = [];
    server.use(
      http.post(`${API}/products/${PID}/media`, async ({ request }) => {
        bodies.push(await request.text());
        return HttpResponse.json(image({ id: "m9" }), { status: 201 });
      }),
    );
    renderPane([image({ device: null })]);

    await userEvent.click(screen.getByRole("tab", { name: /Chưa gán/ }));
    await userEvent.upload(addInput(), [png("a")]);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(part(bodies[0], "device")).toBe("");
  });

  it("opens one image large and steps through that tab only", async () => {
    renderPane([
      image({ id: "m1", caption: "Một", device: "phone" }),
      image({ id: "m2", caption: "Hai", device: "phone" }),
      image({ id: "m3", caption: "Ba", device: "desktop" }),
    ]);

    const cards = screen.getAllByTestId("gallery-item");
    await userEvent.click(
      within(cards[0]).getByRole("button", {
        name: i18n.t("products.gallery.expand"),
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Một")).toBeInTheDocument();
    // Two phone captures, so the header counts within the phone tab.
    expect(within(dialog).getByText(/1\/2/)).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: i18n.t("products.gallery.next"),
      }),
    );
    expect(within(dialog).getByText("Hai")).toBeInTheDocument();

    // Wrapping stays inside the tab: the desktop capture is never reached.
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: i18n.t("products.gallery.next"),
      }),
    );
    expect(within(dialog).getByText("Một")).toBeInTheDocument();
    expect(within(dialog).queryByText("Ba")).toBeNull();
  });

  it("frames a screenshot as the device it was taken on", () => {
    renderPane([
      image({ id: "m1", device: "phone" }),
      image({ id: "m2", device: null }),
    ]);
    const framed = screen
      .getAllByTestId("gallery-item")[0]
      .querySelector(".kd-device");
    expect(framed).toHaveAttribute("data-device", "phone");

    // Nothing to frame it as until somebody files it.
    screen.getByRole("tab", { name: /Chưa gán/ }).click();
  });

  it("does not throw the viewer open when a control on the picture is clicked", async () => {
    const removed = vi.fn();
    server.use(
      http.delete(`${API}/products/${PID}/media/m1`, () => {
        removed();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPane([image({ id: "m1", device: "phone" })]);
    const card = screen.getAllByTestId("gallery-item")[0];

    // The bin sits ON the picture, and the picture opens the viewer.
    await userEvent.click(
      within(card).getByRole("button", { name: i18n.t("common.remove") }),
    );
    await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Replacing: the button clicks a hidden <input type=file>, and that
    // programmatic click bubbles from the input, which is not a button.
    await userEvent.click(
      within(card).getByRole("button", {
        name: i18n.t("products.gallery.replace"),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    // Moving it to another tab is a control too.
    await userEvent.click(
      within(card).getByRole("button", {
        name: i18n.t("products.gallery.device_tablet"),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    // A real mouse lands on the <svg> inside the button, not on the button —
    // userEvent aims at the element it is given, so the icon is clicked
    // directly here to make sure the guard climbs out of the SVG too.
    const binIcon = within(card)
      .getByRole("button", { name: i18n.t("common.remove") })
      .querySelector("svg")!;
    await userEvent.click(binIcon);
    expect(screen.queryByRole("dialog")).toBeNull();

    // The picture itself still opens it.
    await userEvent.click(card.querySelector(".kd-device-screen")!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("features one capture per device, and moving the star frees the old one", async () => {
    const sent: unknown[] = [];
    server.use(
      http.patch(`${API}/products/${PID}/media/:mediaId`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(image({ is_hero: true }));
      }),
    );
    renderPane([
      image({ id: "m1", device: "phone", caption: "Một" }),
      image({ id: "m2", device: "phone", caption: "Hai" }),
    ]);

    const cards = screen.getAllByTestId("gallery-item");
    await userEvent.click(within(cards[1]).getByRole("checkbox"));

    // Looked up rather than indexed: a request still in flight from an
    // earlier test can land in this handler and shift the positions.
    const hero = () =>
      sent.find((body) => (body as Record<string, unknown>).is_hero === true);
    await waitFor(() => expect(hero()).toBeTruthy());
    // The caption travels with it: the API replaces what it is given, so a
    // body carrying only the flag would wipe the caption.
    expect(hero()).toEqual({ caption: "Hai", device: "phone", is_hero: true });
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
