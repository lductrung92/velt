import type { NodeViewProps } from "@tiptap/react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";

import { useWidgetPreview } from "../../hooks/useWidgetPreview";

import { WidgetNodeView } from "./WidgetNodeView";

// WidgetNodeView only uses NodeViewWrapper from @tiptap/react at runtime; render it
// as a plain div so we can mount the view without a live ProseMirror editor.
vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

// The preview tab resolves live data via this hook — stub it so the view mounts
// without a QueryClient / network.
vi.mock("../../hooks/useWidgetPreview", () => ({ useWidgetPreview: vi.fn() }));

// Same reason: the sub-form's category picker reads the taxonomy.
vi.mock("../../hooks/useCmsCategories", () => ({
  useCategories: () => ({ data: [] }),
}));

beforeEach(() => {
  vi.mocked(useWidgetPreview).mockReturnValue({
    isLoading: false,
    isError: false,
    data: { type: "articles_list", data: { items: [] } },
  } as unknown as ReturnType<typeof useWidgetPreview>);
});

const t = (k: string) => i18n.t(k);

function makeProps(
  over: {
    wtype?: string;
    config?: Record<string, unknown>;
    editable?: boolean;
  } = {},
) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const props = {
    node: {
      attrs: {
        wid: "w1",
        wtype: over.wtype ?? "articles_list",
        config: over.config ?? { title: "" },
      },
    },
    updateAttributes,
    deleteNode,
    editor: { isEditable: over.editable ?? true },
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode };
}

function renderView(props: NodeViewProps) {
  return render(
    <I18nextProvider i18n={i18n}>
      <WidgetNodeView {...props} />
    </I18nextProvider>,
  );
}

describe("WidgetNodeView", () => {
  it("renders the config tab + sub-form by default", () => {
    renderView(makeProps().props);
    expect(screen.getByText(t("cms.pages.inline.config"))).toBeInTheDocument();
    expect(
      screen.getByLabelText(t("cms.pages.widget.articles_list.heading")),
    ).toBeInTheDocument();
  });

  it("switches to the preview tab", async () => {
    // Radix Tabs uses automatic activation (on focus), so userEvent (which focuses
    // before clicking) is required — fireEvent.click alone won't switch tabs.
    const user = userEvent.setup();
    renderView(makeProps({ config: { columns: 3, limit: 6 } }).props);
    await user.click(
      screen.getByRole("tab", { name: t("cms.pages.inline.preview") }),
    );
    // Stubbed hook resolves to no items → the preview shows its empty state.
    expect(
      screen.getByText(t("cms.pages.inline.preview_empty")),
    ).toBeInTheDocument();
  });

  it("collapses and expands the body", () => {
    renderView(makeProps().props);
    expect(screen.getByText(t("cms.pages.inline.config"))).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(t("cms.pages.inline.collapse")));
    expect(
      screen.queryByText(t("cms.pages.inline.config")),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(t("cms.pages.inline.expand")));
    expect(screen.getByText(t("cms.pages.inline.config"))).toBeInTheDocument();
  });

  it("updates config when a field changes", () => {
    const { props, updateAttributes } = makeProps({ config: { title: "" } });
    renderView(props);
    fireEvent.change(
      screen.getByLabelText(t("cms.pages.widget.articles_list.heading")),
      {
        target: { value: "Trò chơi nổi bật" },
      },
    );
    expect(updateAttributes).toHaveBeenCalledWith({
      config: expect.objectContaining({ title: "Trò chơi nổi bật" }),
    });
  });

  it("deletes the node via the remove button", () => {
    const { props, deleteNode } = makeProps();
    renderView(props);
    fireEvent.click(screen.getByLabelText(t("cms.pages.inline.remove")));
    expect(deleteNode).toHaveBeenCalled();
  });

  it("hides the remove button and disables inputs when not editable", () => {
    renderView(makeProps({ editable: false }).props);
    expect(
      screen.queryByLabelText(t("cms.pages.inline.remove")),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(t("cms.pages.widget.articles_list.heading")),
    ).toBeDisabled();
  });
});
