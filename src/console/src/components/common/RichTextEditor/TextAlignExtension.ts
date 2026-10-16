import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kdTextAlign: {
      /** Centre or right-align the blocks in the selection; null clears it. */
      setTextAlign: (align: TextAlign | null) => ReturnType;
    };
  }
}

export type TextAlign = "center" | "right";

/**
 * How an alignment travels in the HTML.
 *
 * A class, not a style: the server's sanitizer drops `style` outright and
 * allows exactly these two class names on p and h1–h6 (htmlsan.go). Left is the
 * default and carries no class, so "align left" means removing one.
 */
export const TEXT_ALIGN_CLASS: Record<TextAlign, string> = {
  center: "kd-text--center",
  right: "kd-text--right",
};

const CLASS_TO_ALIGN: Record<string, TextAlign> = {
  "kd-text--center": "center",
  "kd-text--right": "right",
};

/** The blocks that may be aligned — the same list the sanitizer allows. */
const TYPES = ["paragraph", "heading"];

// In-house rather than @tiptap/extension-text-align: that one writes
// `style="text-align:…"`, which this system's sanitizer strips, so the feature
// would look like it worked until the page was saved.
export const TextAlignExtension = Extension.create({
  name: "kdTextAlign",

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => {
              for (const name of element.classList) {
                if (CLASS_TO_ALIGN[name]) return CLASS_TO_ALIGN[name];
              }
              return null;
            },
            renderHTML: (attrs) =>
              attrs.textAlign
                ? { class: TEXT_ALIGN_CLASS[attrs.textAlign as TextAlign] }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (align) =>
        ({ commands }) =>
          // Every block type is asked; the ones the selection does not contain
          // simply answer false, and one success is enough.
          TYPES.map((type) =>
            commands.updateAttributes(type, { textAlign: align }),
          ).some(Boolean),
    };
  },
});
