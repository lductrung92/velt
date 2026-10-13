import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { WidgetNodeView } from "./WidgetNodeView";

// suppressHTML keeps an attribute in the JSON doc (where the editor reads it back)
// but out of the rendered body_html — only the `data-kd-widget` id is emitted there.
const suppressHTML = { renderHTML: () => ({}) };

// WidgetNode is the inline-widget block for the page rich-text editor. Its attrs
// {wid, wtype, config} live in body_json; body_html carries only an empty
// `<div data-kd-widget="<wid>">` placeholder that the public web swaps for the
// resolved widget. It is an atom (no editable children) with a React NodeView.
export const WidgetNode = Node.create({
  name: "widget",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      wid: { default: null, ...suppressHTML },
      wtype: { default: null, ...suppressHTML },
      config: { default: {}, ...suppressHTML },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-kd-widget]",
        getAttrs: (el) => ({
          wid: (el as HTMLElement).getAttribute("data-kd-widget"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-kd-widget": node.attrs.wid ?? "",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WidgetNodeView);
  },
});
