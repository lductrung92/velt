import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kdImage: {
      /** Insert a block <img> with the given attributes. */
      setImage: (attrs: {
        src: string;
        alt?: string;
        title?: string;
      }) => ReturnType;
    };
  }
}

// Minimal block-level <img> node for the article body. Kept in-house (no extra
// @tiptap dependency): it parses/serializes <img src alt title> and exposes a
// setImage command the toolbar uses. The emitted HTML is sanitized server-side
// (bluemonday UGCPolicy allows <img> on http/https only) and rendered on the
// public web via body_html.
export const ImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
