import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Code2, Trash2, Type } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SvgNodeOptions } from "./SvgExtension";

/**
 * One drawing in the body, with its own handles.
 *
 * The same shape as an image's: the atom node selects whole, and the bar that
 * appears on it edits the one attribute the HTML carries. A drawing has two
 * ways in — the markup and the wording on it — so it gets a button for each
 * instead of one "edit" that lands on whichever tab was open last.
 *
 * No width or alignment buttons: a diagram drawn 800 units wide is already
 * narrower than it wants to be in a reading column, and a half-width one would
 * put its labels below the size anyone can read.
 */
export function SvgView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
  extension,
}: NodeViewProps) {
  const { t } = useTranslation();
  const code = String(node.attrs.code ?? "");
  const onEdit = (extension.options as SvgNodeOptions).onEdit;

  const open = (tab: "code" | "preview") =>
    onEdit?.({ code, tab, apply: (next) => updateAttributes({ code: next }) });

  return (
    <NodeViewWrapper as="figure" className="kd-svg" data-selected={selected || undefined}>
      {/* The drawing is markup, not children, so it needs a holder of its own.
          It is already sanitized — on the way in, and again on the server. */}
      <div className="kd-svg-art" dangerouslySetInnerHTML={{ __html: code }} />
      {editor.isEditable && selected && (
        <div className="kd-svg-bar" contentEditable={false}>
          <button
            type="button"
            aria-label={t("editor.svg.edit_code")}
            title={t("editor.svg.edit_code")}
            onClick={() => open("code")}
          >
            <Code2 className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("editor.svg.edit_labels")}
            title={t("editor.svg.edit_labels")}
            onClick={() => open("preview")}
          >
            <Type className="size-3.5" />
          </button>
          <span className="kd-image-bar-sep" aria-hidden />
          <button
            type="button"
            className="is-destructive"
            aria-label={t("editor.svg.remove")}
            title={t("editor.svg.remove")}
            onClick={() => deleteNode()}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
