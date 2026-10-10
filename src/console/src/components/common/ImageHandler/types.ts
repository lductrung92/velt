import type { Crop } from "react-image-crop";

/** Variant of preview shape. Drives both display rendering and crop ratio. */
export type ImageUploadType = "circle" | "rounded";

/**
 * Source of the currently displayed image:
 *   - empty: no image picked yet → component renders `imageDefault`
 *   - uploaded: backend has the bytes; `url` is a stable URL (CDN or local endpoint)
 *   - pending: user picked + cropped but `uploadUrl` was not provided, so the
 *     parent form is responsible for shipping `blob` on submit. `dataUrl` is
 *     used for instant in-place preview without re-reading the blob.
 */
export type ImageUploadValue =
  | { kind: "empty" }
  | { kind: "uploaded"; fileId: string; url: string }
  | { kind: "pending"; dataUrl: string; blob: Blob };

/** State held by ImageCropper while the user is editing inside the modal. */
export interface CropEditState {
  crop: Crop;
  /**
   * Rotation in degrees, in 45° increments. Stored as a RAW accumulating
   * number rather than the user-visible 0–315 range so the CSS transition
   * always runs forward — going from 315° to 360° (= 0° modulo) keeps
   * spinning clockwise instead of snapping back through −315° to 0°. The
   * canvas pipeline uses `rotation * π / 180` so the trig is periodic and
   * doesn't care about the raw value's magnitude. UI consumers should
   * normalise via `((rotation % 360) + 360) % 360` when rendering badges.
   */
  rotation: number;
  /** Multiplier 1.0–3.0 applied via CSS transform on the source image. */
  zoom: number;
  /** Horizontal mirror (left/right flip). Applied before rotation + zoom. */
  flipH: boolean;
  /** Vertical mirror (top/bottom flip). Applied before rotation + zoom. */
  flipV: boolean;
  /**
   * Pan offset in NATURAL pixels, applied as the OUTERMOST translate in the
   * CSS transform chain — i.e. after zoom + rotation + flip — so the image
   * visually slides in screen-aligned coords.
   */
  offsetX: number;
  offsetY: number;
}

/** One item inside an illustrative gallery. */
export interface IllustrativeItem {
  name: { vi: string; en: string };
  url: string;
}

/** One named gallery in the illustrative JSON file. */
export interface IllustrativeCategory {
  title: { vi: string; en: string };
  items: IllustrativeItem[];
}

/** Top-level shape of the illustrative JSON pointed to by `illustrativePath`. */
export type IllustrativeData = Record<string, IllustrativeCategory>;
