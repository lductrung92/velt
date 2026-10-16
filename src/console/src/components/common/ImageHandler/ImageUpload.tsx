import { Camera, ImageIcon, Trash2, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { fileUrl } from "@/utils/fileUrl";

import type { UploadAdapterResult } from "./hooks/useImageUpload";
import { PickerModal } from "./picker/PickerModal";
import type { ImageUploadType, ImageUploadValue } from "./types";
import { computeDimensions } from "./utils";
import { Circle } from "./variants/Circle";
import { Rounded } from "./variants/Rounded";

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp";
const DEFAULT_MAX_MB = 5;

export interface ImageUploadProps {
  type: ImageUploadType;
  /**
   * What the image is for — "Ảnh đại diện", "Ảnh bìa". It names the picker's
   * second line, which is otherwise the same sentence for an avatar and for a
   * product gallery.
   */
  subject?: string;
  /** Required when type='circle'. Preview = radius*2 square. */
  radius?: number;
  /** Required when type='rounded'. Width/height ratio (e.g. 16/9, 1). */
  ratio?: number;
  /** Required when type='rounded'. Height = round(width / ratio). */
  width?: number;

  /** object-fit applied to the preview <img>. Default 'center' (cover). */
  position?: "center" | "initial";
  /**
   * Fallback image URL when value.kind === 'empty'. Defaults to the SVG
   * placeholder we ship in public/img/. Caller can override per use case.
   */
  imageDefault?: string;

  /** Controlled value. Parent owns the source of truth. */
  value?: ImageUploadValue;
  onChange?: (value: ImageUploadValue) => void;

  /**
   * Click handler for "upload" / "change" actions. When omitted, the
   * component mounts its own PickerModal. Provide this to take full
   * control (e.g. open a wizard, route navigation) at which point the
   * internal modal is skipped.
   */
  onRequestPicker?: () => void;

  // Picker modal config (used only when onRequestPicker is NOT provided)
  illustrativePath?: string;
  uploadUrl?: string;
  /** Map upload response to {fileId, url}. Default reads `id`+`url` from
   *  a FileResponse-shaped body. Override when the endpoint returns a
   *  different shape (e.g. AvatarResponse for /account/avatar). */
  uploadResponseAdapter?: (response: unknown) => UploadAdapterResult;
  /** Forwarded to the upload endpoint. Content images that render on public
   *  pages must set `"public"` or the public URL 403s. Defaults to the BE's
   *  `private` when omitted. */
  uploadVisibility?: "public" | "private";
  /** Optional storage-key prefix forwarded to the upload endpoint. */
  uploadPrefix?: string;
  accept?: string;
  maxSizeMb?: number;
  /** Show the webcam capture tab in the picker. Default true; pass false to
   *  hide it (e.g. CMS article images — upload/gallery only). */
  showCamera?: boolean;
  /** Crop mode. Default true → crop/zoom/rotate editor, output re-rendered at
   *  the crop's natural resolution (capped by `outputMax`). false → NO transform:
   *  upload the original file at full resolution and crop via CSS at render time
   *  (best for backgrounds/banners where the source must not be downscaled). */
  crop?: boolean;
  /** When cropping, cap the exported image's longest side in px. Default 2560.
   *  Pass 0 for NO cap → export the cropped region at its native resolution
   *  (no downscale / quality loss). */
  outputMax?: number;

  className?: string;
  disabled?: boolean;
}

const EMPTY: ImageUploadValue = { kind: "empty" };

function pickDefault(type: ImageUploadType, override?: string): string {
  if (override) return override;
  return type === "circle"
    ? "/img/image-placeholder.svg"
    : "/img/image-placeholder-16x9.svg";
}

function valueToSrc(value: ImageUploadValue, fallback: string): string {
  if (value.kind === "uploaded") return fileUrl(value.url);
  if (value.kind === "pending") return value.dataUrl;
  return fallback;
}

/**
 * Adapter: routes to Circle or Rounded variant based on `type`, owns the
 * empty / uploaded / pending state, and renders overlay actions whose
 * visibility tracks the state machine:
 *   empty       → Upload icon (centred)
 *   uploaded    → Remove (top-right) + Change (bottom-right)
 *   pending     → same as uploaded
 */
export function ImageUpload(props: ImageUploadProps) {
  const {
    type,
    position = "center",
    imageDefault,
    value: controlledValue,
    onChange,
    onRequestPicker,
    illustrativePath,
    uploadUrl,
    uploadResponseAdapter,
    uploadVisibility,
    uploadPrefix,
    accept = DEFAULT_ACCEPT,
    maxSizeMb = DEFAULT_MAX_MB,
    showCamera = true,
    className,
    disabled = false,
  } = props;

  const { t } = useTranslation();
  const [uncontrolled, setUncontrolled] = useState<ImageUploadValue>(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);
  const value = controlledValue ?? uncontrolled;

  const dims = computeDimensions(props);
  const fallback = pickDefault(type, imageDefault);
  const src = valueToSrc(value, fallback);
  const objectFitClass =
    position === "center" ? "object-cover" : "object-contain";
  const isEmpty = value.kind === "empty";
  const usesInternalModal = !onRequestPicker;

  const updateValue = useCallback(
    (next: ImageUploadValue) => {
      if (controlledValue === undefined) setUncontrolled(next);
      onChange?.(next);
    },
    [controlledValue, onChange],
  );

  const handlePicker = useCallback(() => {
    if (disabled) return;
    if (onRequestPicker) onRequestPicker();
    else setModalOpen(true);
  }, [disabled, onRequestPicker]);

  const handleRemove = useCallback(() => {
    if (disabled) return;
    updateValue(EMPTY);
  }, [disabled, updateValue]);

  // Action button = small circular fab pinned absolute. Solid-color
  // background with primary brand on hover; matches shadcn token usage so
  // the overlay reads on either a light or dark photo.
  const actionBtn =
    "absolute z-10 flex items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  // Clip wrapper for the <img> only — keeps the photo round-clipped on
  // circles / radius-clipped on rounded tiles WITHOUT also clipping the
  // corner-pinned action buttons (Trash / Camera) which sit outside the
  // visual shape's bounding curve.
  const clipShape = type === "circle" ? "rounded-full" : "rounded-lg";

  // Empty-state: the upload button + a darkening backdrop are hidden until
  // the user hovers the frame. The Circle/Rounded wrapper exposes `group`
  // via the className prop so children opt into `group-hover:*` here.
  const overlay = (
    <>
      <div className={cn("absolute inset-0 overflow-hidden", clipShape)}>
        <img
          src={src}
          alt=""
          draggable={false}
          className={cn("block h-full w-full", objectFitClass)}
        />
      </div>
      {isEmpty && (
        <>
          <button
            type="button"
            aria-label={t("image.upload.trigger")}
            title={t("image.upload.trigger")}
            disabled={disabled}
            onClick={handlePicker}
            className={cn(
              actionBtn,
              "inset-0 m-auto h-10 w-10",
              // Always visible while the slot is empty. It used to wait for
              // `group-hover`, which never fires on a touch device — so on a
              // tablet the slot looked like a decorative grey box with no way
              // to fill it. There is nothing underneath to reveal: the
              // placeholder is a flat tint, and this button is the affordance.
              "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
            )}
          >
            <Upload className={type === "circle" ? "h-4 w-4" : "h-5 w-5"} />
          </button>
        </>
      )}
      {!isEmpty && (
        <>
          <button
            type="button"
            aria-label={t("image.upload.remove")}
            title={t("image.upload.remove")}
            disabled={disabled}
            onClick={handleRemove}
            className={cn(
              actionBtn,
              "right-1 top-1 h-7 w-7",
              // Trash = destructive: paint the hover state red so the
              // affordance reads as "delete", not "swap".
              "hover:bg-destructive hover:text-destructive-foreground",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("image.upload.change")}
            title={t("image.upload.change")}
            disabled={disabled}
            onClick={handlePicker}
            className={cn(actionBtn, "bottom-1 right-1 h-7 w-7")}
          >
            {type === "circle" ? (
              <Camera className="h-3.5 w-3.5" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </>
      )}
    </>
  );

  // `group` enables the empty-state overlay's `group-hover:*` classes
  // (backdrop + upload button) to react to the frame being hovered.
  const frame =
    type === "circle" ? (
      <Circle width={dims.w} className={cn("group", className)}>
        {overlay}
      </Circle>
    ) : (
      <Rounded
        width={dims.w}
        height={dims.h}
        className={cn("group", className)}
      >
        {overlay}
      </Rounded>
    );

  if (!usesInternalModal) return frame;

  return (
    <>
      {frame}
      <PickerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={(next) => updateValue(next)}
        type={type}
        radius={props.radius}
        ratio={props.ratio}
        width={props.width}
        accept={accept}
        maxSizeMb={maxSizeMb}
        illustrativePath={illustrativePath}
        uploadUrl={uploadUrl}
        uploadResponseAdapter={uploadResponseAdapter}
        uploadVisibility={uploadVisibility}
        uploadPrefix={uploadPrefix}
        showCamera={showCamera}
        crop={props.crop}
        subject={props.subject}
        outputMax={props.outputMax}
      />
    </>
  );
}
