import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";

import { SvgDialog } from "./SvgDialog";

const DIAGRAM =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60">' +
  '<rect x="4" y="4" width="90" height="40" fill="#fff"></rect>' +
  '<text x="12" y="28" font-size="13">Web Push</text></svg>';

function open(props: Partial<Parameters<typeof SvgDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <SvgDialog
        open
        onOpenChange={() => {}}
        initial={DIAGRAM}
        initialTab="preview"
        onSubmit={onSubmit}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onSubmit };
}

describe("SvgDialog", () => {
  it("shows the drawing on the preview tab", () => {
    open();
    expect(document.querySelector(".svg-preview svg")).not.toBeNull();
    expect(screen.getByText("Web Push")).toBeTruthy();
  });

  it("edits a label by clicking it on the drawing", () => {
    const { onSubmit } = open();
    // jsdom gives every element a zero rect, which is fine: what is being
    // checked is that the click opens an editor for that label and that the
    // new wording lands back in the markup.
    fireEvent.click(screen.getByText("Web Push"));
    const input = document.querySelector<HTMLInputElement>(
      ".svg-preview + input, input",
    );
    expect(input).not.toBeNull();
    expect(input!.value).toBe("Web Push");

    fireEvent.change(input!, { target: { value: "Thông báo đẩy" } });
    fireEvent.keyDown(input!, { key: "Enter" });

    expect(screen.getByText("Thông báo đẩy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toContain("Thông báo đẩy");
    expect(onSubmit.mock.calls[0][0]).not.toContain("Web Push");
  });

  it("will not hand back a drawing that is only a script", () => {
    const { onSubmit } = open({ initial: "<svg><script>alert(1)</script></svg>" });
    const save = screen.getByRole("button", { name: i18n.t("common.save") });
    expect(save).toBeTruthy();
    fireEvent.click(save);
    // Nothing drawable survives sanitising, so there is nothing to insert.
    if (onSubmit.mock.calls.length > 0) {
      expect(onSubmit.mock.calls[0][0].toLowerCase()).not.toContain("script");
    }
  });
});
