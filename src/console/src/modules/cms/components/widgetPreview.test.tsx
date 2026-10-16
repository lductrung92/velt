import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";

import { useWidgetPreview } from "../hooks/useWidgetPreview";

import { WidgetPreview } from "./widgetPreview";

vi.mock("../hooks/useWidgetPreview", () => ({ useWidgetPreview: vi.fn() }));
const mockHook = vi.mocked(useWidgetPreview);

function setHook(v: { isLoading: boolean; isError: boolean; data: unknown }) {
  mockHook.mockReturnValue(v as unknown as ReturnType<typeof useWidgetPreview>);
}

function renderPreview(type: string, config: Record<string, unknown>) {
  return render(
    <I18nextProvider i18n={i18n}>
      <WidgetPreview type={type} config={config} />
    </I18nextProvider>,
  );
}

afterEach(() => mockHook.mockReset());

describe("WidgetPreview", () => {
  it("shows a skeleton grid while list data loads", () => {
    setHook({ isLoading: true, isError: false, data: undefined });
    const { container } = renderPreview("product_grid", { columns: 3 });
    expect(container.querySelectorAll(".aspect-video")).toHaveLength(3);
  });

  it("renders the resolved live items for a list widget", () => {
    setHook({
      isLoading: false,
      isError: false,
      data: {
        type: "product_grid",
        data: {
          items: [
            {
              slug: "kho-gon",
              name: "Kho Gọn",
              summary: null,
              cover_url: null,
              lifecycle: "live",
              is_featured: false,
              audience: [],
              platforms: [],
              categories: [],
            },
          ],
        },
      },
    });
    renderPreview("product_grid", { columns: 3 });
    expect(screen.getByText("Kho Gọn")).toBeInTheDocument();
  });

  it("shows the empty state when the list resolves to no items", () => {
    setHook({
      isLoading: false,
      isError: false,
      data: { type: "product_grid", data: { items: [] } },
    });
    renderPreview("product_grid", {});
    expect(
      screen.getByText(i18n.t("cms.pages.inline.preview_empty")),
    ).toBeInTheDocument();
  });

  it("shows the error state when the preview fails", () => {
    setHook({ isLoading: false, isError: true, data: undefined });
    renderPreview("product_grid", {});
    expect(
      screen.getByText(i18n.t("cms.pages.inline.preview_error")),
    ).toBeInTheDocument();
  });

  it("renders rich_text HTML without fetching", () => {
    renderPreview("rich_text", { html: "<strong>Xin chào</strong>" });
    expect(screen.getByText("Xin chào")).toBeInTheDocument();
    expect(mockHook).not.toHaveBeenCalled();
  });

  it("renders cta_banner heading + button without fetching", () => {
    renderPreview("cta_banner", {
      heading: "Tham gia",
      buttons: [{ label: "Bắt đầu" }],
    });
    expect(screen.getByText("Tham gia")).toBeInTheDocument();
    expect(screen.getByText("Bắt đầu")).toBeInTheDocument();
    expect(mockHook).not.toHaveBeenCalled();
  });
});
