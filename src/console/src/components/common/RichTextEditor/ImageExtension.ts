import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { ImageView } from "./ImageView";

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

export type ImageAlign = "left" | "center" | "right";

/**
 * What the node needs from whoever embedded it.
 *
 * Replacing an image means uploading one, and where an upload goes depends on
 * the record being edited — which this shared editor knows nothing about. The
 * host passes a picker in; without one the replace button simply is not there.
 */
export interface ImageNodeOptions {
  pickImage?: () => Promise<{ src: string; alt?: string } | null>;
}

/**
 * How an alignment travels in the HTML.
 *
 * A class, not a style: the server's sanitizer drops `style` outright and
 * allows exactly these three class names on an `img` (htmlsan.go), so this map
 * is the whole vocabulary — the site's CSS defines what each one looks like.
 */
export const IMAGE_ALIGN_CLASS: Record<ImageAlign, string> = {
  left: "kd-img--left",
  center: "kd-img--center",
  right: "kd-img--right",
};

const CLASS_TO_ALIGN: Record<string, ImageAlign> = {
  "kd-img--left": "left",
  "kd-img--center": "center",
  "kd-img--right": "right",
};

/** The widths a button offers, as a share of the column. */
export type ImageSize = "25" | "50" | "75" | "100";

/**
 * Why a width is a class and not the `width` attribute.
 *
 * `width`/`height` must carry the image's REAL pixel size: that pair is how a
 * browser reserves the right box before the bytes arrive, and it is the whole
 * of the "image elements do not have explicit width and height" audit. A
 * percentage there says nothing about the shape, so the page still jumps.
 *
 * So the share of the column travels as a class the site's CSS understands,
 * and the two never fight over one attribute.
 */
export const IMAGE_SIZE_CLASS: Record<ImageSize, string> = {
  "25": "kd-img--w25",
  "50": "kd-img--w50",
  "75": "kd-img--w75",
  "100": "kd-img--w100",
};

const CLASS_TO_SIZE: Record<string, ImageSize> = {
  "kd-img--w25": "25",
  "kd-img--w50": "50",
  "kd-img--w75": "75",
  "kd-img--w100": "100",
};

/** What the sanitizer keeps on width/height: whole pixels. */
const PIXELS = /^[0-9]+$/;

// Minimal block-level <img> node for the article body. Kept in-house (no extra
// @tiptap dependency): it parses/serializes <img src alt title width class> and
// exposes a setImage command the toolbar uses. The emitted HTML is sanitized
// server-side (bluemonday UGCPolicy allows <img> on http/https only) and
// rendered on the public web via body_html.
export const ImageNode = Node.create<ImageNodeOptions>({
  name: "image",

  addOptions() {
    return { pickImage: undefined };
  },
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      // The real pixel size of what is drawn: the intrinsic size of the file
      // for an image sized by class, or the dragged size when somebody has
      // dragged one. Either way the pair describes the same shape, which is
      // all the browser needs to hold the space.
      width: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("width");
          return value && PIXELS.test(value) ? value : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { width: String(attrs.width) } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("height");
          return value && PIXELS.test(value) ? value : null;
        },
        renderHTML: (attrs) =>
          attrs.height ? { height: String(attrs.height) } : {},
      },
      // A share of the column. Mutually exclusive with a dragged width: one
      // says "half of whatever this column is", the other "exactly 668px".
      size: {
        default: null,
        parseHTML: (element) => {
          for (const name of element.classList) {
            if (CLASS_TO_SIZE[name]) return CLASS_TO_SIZE[name];
          }
          return null;
        },
        renderHTML: () => ({}), // written with align, below
      },
      align: {
        default: null,
        parseHTML: (element) => {
          for (const name of element.classList) {
            if (CLASS_TO_ALIGN[name]) return CLASS_TO_ALIGN[name];
          }
          return null;
        },
        // One attribute carries both classes, so neither overwrites the other.
        renderHTML: (attrs) => {
          const names = [
            attrs.size ? IMAGE_SIZE_CLASS[attrs.size as ImageSize] : "",
            attrs.align ? IMAGE_ALIGN_CLASS[attrs.align as ImageAlign] : "",
          ].filter(Boolean);
          return names.length ? { class: names.join(" ") } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
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
