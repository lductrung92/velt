import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import i18n from "@/app/i18n";

import { StringListField } from "./StringListField";

// Controlled component — drive it through a tiny host so the tests exercise the
// same round-trip a form does.
function Host({ initial = [] as string[], max }: { initial?: string[]; max?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <I18nextProvider i18n={i18n}>
      <StringListField value={value} onChange={setValue} max={max} />
    </I18nextProvider>
  );
}

const input = () => screen.getByRole("textbox");

describe("StringListField", () => {
  it("adds a value on Enter", async () => {
    render(<Host />);
    await userEvent.type(input(), "Go{Enter}");
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("adds a value on comma", async () => {
    render(<Host />);
    await userEvent.type(input(), "React,");
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("trims and ignores blanks and duplicates", async () => {
    render(<Host />);
    await userEvent.type(input(), "  Go  {Enter}");
    await userEvent.type(input(), "Go{Enter}");
    await userEvent.type(input(), "   {Enter}");
    expect(screen.getAllByText("Go")).toHaveLength(1);
  });

  it("commits a half-typed value on blur so it is not lost", async () => {
    render(<Host />);
    await userEvent.type(input(), "Postgres");
    await userEvent.tab();
    expect(screen.getByText("Postgres")).toBeInTheDocument();
  });

  it("removes the last chip on Backspace in an empty input", async () => {
    render(<Host initial={["Go", "React"]} />);
    await userEvent.click(input());
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("React")).not.toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("keeps the chip when Backspace follows typed text", async () => {
    render(<Host initial={["Go"]} />);
    await userEvent.type(input(), "ab{Backspace}");
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("removes a chip via its remove button", async () => {
    render(<Host initial={["Go", "React"]} />);
    const buttons = screen.getAllByRole("button", {
      name: i18n.t("common.remove"),
    });
    await userEvent.click(buttons[0]);
    expect(screen.queryByText("Go")).not.toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("hides the input once max is reached", async () => {
    render(<Host initial={["a"]} max={1} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not submit the surrounding form when Enter adds a value", async () => {
    let submitted = false;
    function FormHost() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <I18nextProvider i18n={i18n}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitted = true;
            }}
          >
            <StringListField value={value} onChange={setValue} />
          </form>
        </I18nextProvider>
      );
    }
    render(<FormHost />);
    await userEvent.type(input(), "Go{Enter}");
    expect(submitted).toBe(false);
    expect(screen.getByText("Go")).toBeInTheDocument();
  });
});
