import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";

import { ArticlesListForm, ProductGridForm } from "./widgetForms";

// Both pickers read a taxonomy. Stub the two hooks so the forms mount without a
// QueryClient — what is under test is how a pick reaches the config.
vi.mock("../hooks/useCmsCategories", () => ({
  useCategories: () => ({
    data: [
      {
        id: "c1",
        name: "Tin tức",
        name_display: "Tin tức",
        slug: "tin-tuc",
        children: [
          {
            id: "c2",
            name: "Sự kiện",
            name_display: "Sự kiện",
            slug: "su-kien",
            children: [],
          },
        ],
      },
    ],
  }),
}));
vi.mock("@/modules/products/hooks/useProductCategories", () => ({
  useProductCategories: () => ({
    data: { items: [{ id: "p1", slug: "do-choi", name: "Đồ chơi", name_display: "Đồ chơi" }] },
  }),
}));

const t = (k: string) => i18n.t(k);

/** Opens the react-select that `label` names. */
function open(label: string) {
  fireEvent.mouseDown(screen.getByLabelText(label).closest(".rs__control")!);
}

/** Opens it and clicks one of its options. */
function pick(label: string, option: string | RegExp) {
  open(label);
  fireEvent.click(screen.getByText(option));
}

describe("ProductGridForm", () => {
  it("files a picked category under its slug", () => {
    const onChange = vi.fn();
    render(<ProductGridForm value={{}} onChange={onChange} />);
    pick(t("cms.pages.widget.product_grid.category"), "Đồ chơi");
    expect(onChange).toHaveBeenCalledWith({ category: "do-choi" });
  });

  it("offers every category as the first option, and sends it as empty", () => {
    const onChange = vi.fn();
    render(
      <ProductGridForm value={{ category: "do-choi" }} onChange={onChange} />,
    );
    pick(
      t("cms.pages.widget.product_grid.category"),
      t("cms.pages.widget.all_categories"),
    );
    expect(onChange).toHaveBeenCalledWith({ category: "" });
  });

  it("offers a random order too", () => {
    const onChange = vi.fn();
    render(<ProductGridForm value={{}} onChange={onChange} />);
    pick(
      t("cms.pages.widget.product_grid.sort"),
      t("cms.pages.widget.product_grid.sort_random"),
    );
    expect(onChange).toHaveBeenCalledWith({ sort: "random" });
  });

  it("starts on featured and files the picked order", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ProductGridForm value={{}} onChange={onChange} />,
    );
    expect(
      container.querySelectorAll(".rs__single-value")[1]?.textContent,
    ).toBe(t("cms.pages.widget.product_grid.sort_featured"));
    pick(
      t("cms.pages.widget.product_grid.sort"),
      t("cms.pages.widget.product_grid.sort_newest"),
    );
    expect(onChange).toHaveBeenCalledWith({ sort: "newest" });
  });
});

describe("ArticlesListForm", () => {
  it("files a picked category under its id", () => {
    const onChange = vi.fn();
    render(<ArticlesListForm value={{}} onChange={onChange} />);
    pick(t("cms.pages.widget.articles_list.category_id"), "Tin tức");
    expect(onChange).toHaveBeenCalledWith({ filters: { category_id: "c1" } });
  });

  it("indents a child category instead of flattening the tree away", () => {
    render(<ArticlesListForm value={{}} onChange={vi.fn()} />);
    open(t("cms.pages.widget.articles_list.category_id"));
    expect(screen.getByText(/Sự kiện/).textContent).toBe("  Sự kiện");
  });

  it("starts on newest and files the picked order", () => {
    const onChange = vi.fn();
    render(<ArticlesListForm value={{}} onChange={onChange} />);
    pick(
      t("cms.pages.widget.articles_list.sort"),
      t("cms.pages.widget.articles_list.sort_oldest"),
    );
    expect(onChange).toHaveBeenCalledWith({ sort: "oldest" });
  });
});
