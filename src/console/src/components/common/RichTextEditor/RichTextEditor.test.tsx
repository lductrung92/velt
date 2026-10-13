import { render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";

import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("reports an empty document as an empty string, not as <p></p>", async () => {
    // Tiptap serialises an empty document to "<p></p>", and emits once as it
    // mounts. Against a form default of "" that counts as a change, so every
    // brand-new record was dirty before the user typed a character and the
    // unsaved-changes prompt fired on a form nobody had touched.
    //
    // jsdom cannot drive keystrokes into a ProseMirror surface (it has no
    // elementFromPoint), but it does not need to: the mount emission IS the
    // regression, and that is observable here.
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <RichTextEditor value="" onChange={onChange} ariaLabel="thân bài" />
      </I18nextProvider>,
    );

    await waitFor(() => {
      if (!document.querySelector(".ProseMirror")) {
        throw new Error("Tiptap has not mounted");
      }
    });

    for (const call of onChange.mock.calls) {
      expect(call[0]).toBe("");
    }
  });
});
