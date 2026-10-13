import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WidgetSelect } from "./WidgetSelect";

const opts = [
  { value: "grid", label: "Lưới" },
  { value: "carousel", label: "Băng chuyền" },
];

describe("WidgetSelect", () => {
  it("calls onChange with the picked option's value", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <WidgetSelect
        value="grid"
        options={opts}
        onChange={onChange}
        ariaLabel="layout"
      />,
    );
    fireEvent.mouseDown(container.querySelector(".rs__control")!);
    fireEvent.click(await screen.findByText("Băng chuyền"));
    expect(onChange).toHaveBeenCalledWith("carousel");
  });

  it("shows the current value", () => {
    const { container } = render(
      <WidgetSelect
        value="carousel"
        options={opts}
        onChange={vi.fn()}
        ariaLabel="layout"
      />,
    );
    expect(container.querySelector(".rs__single-value")?.textContent).toBe(
      "Băng chuyền",
    );
  });

  it("marks the control disabled when disabled", () => {
    const { container } = render(
      <WidgetSelect
        value="grid"
        options={opts}
        onChange={vi.fn()}
        disabled
        ariaLabel="layout"
      />,
    );
    expect(
      container.querySelector(".rs__control--is-disabled"),
    ).toBeInTheDocument();
  });
});
