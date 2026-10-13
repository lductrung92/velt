import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Trash2 } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RowAction, RowActions } from "./RowActions";

const wrap = (ui: React.ReactNode) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("RowActions", () => {
  it("names the action for a screen reader and for a hovering mouse", () => {
    wrap(
      <RowActions>
        <RowAction icon={Pencil} label="Sửa" onClick={() => {}} />
      </RowActions>,
    );
    const button = screen.getByRole("button", { name: "Sửa" });
    expect(button).toHaveAttribute("title", "Sửa");
  });

  it("paints a destructive icon with the ink red, not the fill red", () => {
    // --destructive is a FILL tuned against white text: as an icon colour it
    // measures 2.03:1 in dark mode, i.e. an invisible bin. Three screens had
    // drifted onto it before this component existed.
    wrap(
      <RowActions>
        <RowAction destructive icon={Trash2} label="Xoá" onClick={() => {}} />
      </RowActions>,
    );
    const icon = screen.getByRole("button", { name: "Xoá" }).querySelector("svg");
    expect(icon).toHaveClass("text-destructive-ink");
    expect(icon).not.toHaveClass("text-destructive");
  });

  it("leaves a non-destructive icon uncoloured", () => {
    wrap(
      <RowActions>
        <RowAction icon={Pencil} label="Sửa" onClick={() => {}} />
      </RowActions>,
    );
    const icon = screen.getByRole("button", { name: "Sửa" }).querySelector("svg");
    expect(icon?.getAttribute("class")).not.toMatch(/text-destructive/);
  });

  it("renders a link when the action navigates, so it opens in a new tab", () => {
    wrap(
      <RowActions>
        <RowAction icon={Pencil} label="Sửa" to="/cms/pages/p1" />
      </RowActions>,
    );
    expect(screen.getByRole("link", { name: "Sửa" })).toHaveAttribute(
      "href",
      "/cms/pages/p1",
    );
  });

  it("does not fire while disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    wrap(
      <RowActions>
        <RowAction icon={Pencil} label="Sửa" disabled onClick={onClick} />
      </RowActions>,
    );
    await user.click(screen.getByRole("button", { name: "Sửa" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("gives every action the same square button, whatever it does", () => {
    wrap(
      <RowActions>
        <RowAction icon={Pencil} label="Sửa" to="/x" />
        <RowAction destructive icon={Trash2} label="Xoá" onClick={() => {}} />
      </RowActions>,
    );
    // A row whose pencil is a link and whose bin is a button must not end up
    // with two different widths; MemberRow used size="sm" and drifted wider.
    const sizes = [
      screen.getByRole("link", { name: "Sửa" }).className,
      screen.getByRole("button", { name: "Xoá" }).className,
    ];
    expect(sizes[0]).toContain("h-9 w-9");
    expect(sizes[1]).toContain("h-9 w-9");
  });
});
