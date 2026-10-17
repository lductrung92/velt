import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RichText } from "./RichText";

/**
 * This component is a copy of the site's, kept in step by hand. These tests
 * guard the two properties that would actually hurt if the copies drifted:
 * the operator must see the same formatting the visitor saw, and the model's
 * output must never become markup on a privileged screen.
 */
describe("RichText in the chat inbox", () => {
  it("renders the assistant's markdown instead of showing the markers", () => {
    const { container } = render(<RichText text="**Nat** — Kỹ sư hệ thống" />);
    expect(container.querySelector("strong")?.textContent).toBe("Nat");
    expect(container.textContent).not.toContain("**");
  });

  it("handles italic, code and headings", () => {
    expect(
      render(<RichText text="*nghiêng*" />).container.querySelector("em")
        ?.textContent,
    ).toBe("nghiêng");
    expect(
      render(<RichText text="`list_members`" />).container.querySelector("code")
        ?.textContent,
    ).toBe("list_members");
    const h = render(<RichText text="### Đội ngũ" />).container;
    expect(h.querySelector("strong")?.textContent).toBe("Đội ngũ");
    expect(h.textContent).not.toContain("#");
  });

  it("keeps line structure, which the bubble lays out with pre-wrap", () => {
    const { container } = render(<RichText text={"một\nhai\nba"} />);
    expect(container.textContent).toBe("một\nhai\nba");
  });

  it("leaves a stray marker alone rather than eating the rest of the line", () => {
    // Far more common than a formatting mistake, and swallowing the text
    // would lose what the visitor actually said.
    expect(render(<RichText text="2 * 3 = 6" />).container.textContent).toBe(
      "2 * 3 = 6",
    );
  });

  it("never turns the model's output into markup", () => {
    // The assistant repeats what a visitor types, so these are reachable from
    // outside. The property is "no element was created" — React escapes the
    // payload, so the words survive as text, which is exactly right.
    for (const attack of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "[click](javascript:alert(1))",
      "**<script>alert(1)</script>**",
    ]) {
      const { container } = render(<RichText text={attack} />);
      const tags = Array.from(container.querySelectorAll("*")).map((n) =>
        n.tagName.toLowerCase(),
      );
      for (const tag of tags) {
        expect(["span", "strong", "em", "code"]).toContain(tag);
      }
      expect(container.innerHTML).not.toContain("href=");
    }
  });
});
