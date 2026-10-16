import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Replace,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { fileUrl } from "@/utils/fileUrl";

import {
  IMAGE_ALIGN_CLASS,
  IMAGE_SIZE_CLASS,
  type ImageAlign,
  type ImageNodeOptions,
  type ImageSize,
} from "./ImageExtension";

/** The widths the buttons offer, as a share of the column. */
const PRESETS: ImageSize[] = ["25", "50", "75", "100"];
const ALIGNS: { value: ImageAlign; icon: LucideIcon }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

/** Dragging writes whole pixels: the sanitizer keeps `^[0-9]+%?$` and no more. */
const MIN_WIDTH = 48;

/**
 * One image in the body, with its own handles.
 *
 * Tiptap renders an atom node as an opaque box, so selecting it selects the
 * whole thing — which is what makes a toolbar possible at all: it appears on
 * the selected image and writes back through `updateAttributes`, the same two
 * attributes the HTML carries.
 *
 * Only `width` and one `class` are ever written, because only those two survive
 * the server's sanitizer. A handle that produced a `style` would look like it
 * worked until the page was saved.
 */
export function ImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
  extension,
}: NodeViewProps) {
  const { t } = useTranslation();
  const frame = useRef<HTMLDivElement>(null);
  const src = String(node.attrs.src ?? "");
  const alt = node.attrs.alt ? String(node.attrs.alt) : "";
  const width = node.attrs.width ? String(node.attrs.width) : null;
  const size = (node.attrs.size ?? null) as ImageSize | null;
  // A size class means "a share of the column" and the pixel width is only the
  // file's own size, so the frame must follow the class, not the attribute.
  // Without a class the dragged width is the layout, and CSS needs the unit the
  // attribute does not carry.
  const cssWidth = size ? `${size}%` : width ? `${width}px` : undefined;
  const align = (node.attrs.align ?? null) as ImageAlign | null;
  const editable = editor.isEditable;
  const pickImage = (extension.options as ImageNodeOptions).pickImage;

  async function replace() {
    const picked = await pickImage?.();
    if (picked) updateAttributes({ src: picked.src, alt: picked.alt ?? null });
  }

  /**
   * The drag.
   *
   * Bound as a DOM property rather than through React's onPointerDown: inside
   * the editable surface the press never reaches React's root listener — it is
   * stopped on the way up — so a JSX handler simply never runs. Measured, not
   * guessed: a capture listener on the handle sees the pointerdown, React's
   * does not.
   *
   * The move/up pair then goes on the window, because each new width re-renders
   * this view and a listener bound to the handle would die with the element it
   * was bound to, one pixel into the gesture. The window also keeps the drag
   * alive outside the image, which is most of a resize.
   */
  function startResize(event: PointerEvent, fromRight: boolean) {
    event.preventDefault();
    event.stopPropagation();
    const box = frame.current?.getBoundingClientRect();
    const ratio = box ? box.width / box.height : 1;
    const parent = frame.current?.parentElement?.getBoundingClientRect();
    if (!box || !parent) return;

    const move = (e: PointerEvent) => {
      const next = fromRight ? e.clientX - box.left : box.right - e.clientX;
      const clamped = Math.round(
        Math.max(MIN_WIDTH, Math.min(next, parent.width)),
      );
      // An exact width is not a share of the column, so it drops the class
      // rather than fighting it; height follows so the shape is still declared.
      updateAttributes({
        size: null,
        width: String(clamped),
        height: String(Math.round(clamped / ratio)),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <NodeViewWrapper
      className={cn(
        "kd-image",
        align && IMAGE_ALIGN_CLASS[align],
        size && IMAGE_SIZE_CLASS[size],
      )}
      data-selected={selected || undefined}
    >
      <div ref={frame} className="kd-image-frame" style={{ width: cssWidth }}>
        <img
          src={fileUrl(src)}
          alt={alt}
          draggable={false}
          // The file's real size, learnt from the image itself and written into
          // the attributes the browser uses to hold the space. Only once: a
          // dragged width replaces it, and rewriting it on every render would
          // undo the drag.
          onLoad={(e) => {
            if (width) return;
            const el = e.currentTarget;
            if (!el.naturalWidth) return;
            updateAttributes({
              width: String(el.naturalWidth),
              height: String(el.naturalHeight),
            });
          }}
        />
        {editable && selected && (
          <>
            {(["left", "right"] as const).map((edge) => (
              <button
                key={edge}
                type="button"
                // Chrome of its own inside a contenteditable surface, so the
                // editor leaves the press alone.
                contentEditable={false}
                className={`kd-image-handle is-${edge}`}
                aria-label={t("editor.image_resize")}
                ref={(el) => {
                  if (el) {
                    el.onpointerdown = (e) => startResize(e, edge === "right");
                  }
                }}
              />
            ))}
            <div className="kd-image-bar" contentEditable={false}>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={size === preset}
                  onClick={() => updateAttributes({ size: preset })}
                >
                  {preset}%
                </button>
              ))}
              <span className="kd-image-bar-sep" aria-hidden />
              {ALIGNS.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={t(`editor.image_align_${value}`)}
                  aria-pressed={align === value}
                  onClick={() =>
                    updateAttributes({ align: align === value ? null : value })
                  }
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
              <span className="kd-image-bar-sep" aria-hidden />
              {pickImage && (
                <button
                  type="button"
                  aria-label={t("editor.image_replace")}
                  onClick={() => void replace()}
                >
                  <Replace className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                className="is-destructive"
                aria-label={t("editor.image_remove")}
                onClick={() => deleteNode()}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
