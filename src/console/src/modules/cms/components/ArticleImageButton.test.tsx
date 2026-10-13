import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArticleImageButton } from "./ArticleImageButton";

const mutateAsync = vi.fn();
vi.mock("../hooks/useCmsArticles", () => ({
  useUploadArticleMedia: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// A minimal Tiptap editor stub recording the setImage chain.
function fakeEditor() {
  const run = vi.fn();
  const setImage = vi.fn(() => ({ run }));
  const focus = vi.fn(() => ({ setImage }));
  const chain = vi.fn(() => ({ focus }));
  return { editor: { chain } as unknown as Editor, setImage, run };
}

describe("ArticleImageButton", () => {
  beforeEach(() => mutateAsync.mockReset());

  it("is disabled on an unsaved draft when the caller cannot defer", () => {
    render(<ArticleImageButton editor={{} as Editor} />);
    expect(screen.getByRole("button", { name: "editor.image" })).toBeDisabled();
  });

  it("defers the upload on an unsaved draft and inserts a local preview", async () => {
    // No article id yet, so there is no folder to upload into: the file is
    // handed back to the editor and inserted under an object URL.
    const createObjectURL = vi.fn(() => "blob:local-1");
    vi.stubGlobal("URL", { ...URL, createObjectURL });
    const onDeferred = vi.fn();
    const f = fakeEditor();
    render(<ArticleImageButton editor={f.editor} onDeferred={onDeferred} />);

    const file = new File(["x"], "pic.png", { type: "image/png" });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, file);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onDeferred).toHaveBeenCalledWith({ url: "blob:local-1", file });
    expect(f.setImage).toHaveBeenCalledWith({
      src: "blob:local-1",
      alt: "pic.png",
    });
    vi.unstubAllGlobals();
  });

  it("uploads the picked file as inline and inserts an <img> with the CDN url", async () => {
    mutateAsync.mockResolvedValue({
      path: "cms/articles/a1/inline-x.png",
      url: "https://cdn.test/cms/articles/a1/inline-x.png",
    });
    const f = fakeEditor();
    render(<ArticleImageButton editor={f.editor} articleId="a1" />);

    const file = new File(["x"], "pic.png", { type: "image/png" });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, file);

    expect(mutateAsync).toHaveBeenCalledWith({
      id: "a1",
      file,
      purpose: "inline",
    });
    expect(f.setImage).toHaveBeenCalledWith({
      src: "https://cdn.test/cms/articles/a1/inline-x.png",
      alt: "pic.png",
    });
    expect(f.run).toHaveBeenCalled();
  });
});
