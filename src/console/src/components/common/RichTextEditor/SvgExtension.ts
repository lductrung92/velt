import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { SvgView } from "./SvgView";
import { sanitizeSvg } from "./svgSafe";

/** What a drawing needs from whoever mounted the editor: somewhere to edit. */
export interface SvgNodeOptions {
  /**
   * Opens the SVG dialog on this drawing. The host owns the dialog (one per
   * editor, not one per drawing) and hands the result back through `apply`.
   */
  onEdit?: (request: {
    code: string;
    tab: "code" | "preview";
    apply: (code: string) => void;
  }) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kdSvg: {
      /** Insert a drawing, or replace the one that is selected. */
      setSvg: (code: string) => ReturnType;
    };
  }
}

/**
 * An inline SVG drawing, kept as one block the editor does not look inside.
 *
 * The markup is held whole in an attribute rather than modelled as nodes: a
 * diagram is authored as markup and edited through the SVG dialog, so breaking
 * it into editable nodes would only give the editor a way to half-rewrite it.
 *
 * Inline, because the labels are text — they stay searchable, selectable and
 * translatable with the article. The server keeps the same drawing vocabulary
 * this stores (htmlsan/svg.go).
 */
export const SvgNode = Node.create<SvgNodeOptions>({
  name: "svgBlock",

  addOptions() {
    return { onEdit: undefined };
  },
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: "",
        // The attribute never reaches the HTML: the drawing IS the HTML.
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      // The wrapper first: a drawing already saved arrives inside one, and
      // matching the <svg> alone would leave the empty figure behind.
      {
        tag: "figure.kd-svg",
        getAttrs: (element) => ({
          code: sanitizeSvg(element.querySelector("svg")?.outerHTML ?? ""),
        }),
      },
      { tag: "svg", getAttrs: (element) => ({ code: sanitizeSvg(element.outerHTML) }) },
    ];
  },

  renderHTML({ node }) {
    const holder = document.createElement("div");
    holder.innerHTML = String(node.attrs.code ?? "");
    // The figure is what the stylesheet scrolls sideways on a narrow screen.
    // Without it a wide diagram shrinks to fit the column and its labels
    // become unreadable — the same problem a wide table has, solved the same
    // way. The class is the one the sanitizer allows there (htmlsan/svg.go).
    const figure = document.createElement("figure");
    figure.setAttribute("class", "kd-svg");
    figure.append(
      holder.firstElementChild ??
        // An empty or unusable drawing still renders as a block, so it can be
        // fixed or deleted instead of silently disappearing.
        document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    );
    return figure;
  },

  addNodeView() {
    return ReactNodeViewRenderer(SvgView);
  },

  addCommands() {
    return {
      setSvg:
        (code) =>
        ({ commands }) => {
          const safe = sanitizeSvg(code);
          if (!safe) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { code: safe },
          });
        },
    };
  },
});
