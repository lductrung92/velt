import type { Crop } from "react-image-crop";

import type { CropEditState } from "./types";

/** Load an HTMLImageElement from a URL (data URL or http URL). Resolves once
 *  the image fires onload so callers can read naturalWidth / naturalHeight. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

/** Default crop frame: percent-based so it renders correctly on first paint
 *  even before the image's intrinsic dimensions are known. Centred at 80%
 *  of the smaller axis, locked to `aspect`. */
export function defaultCrop(imgW: number, imgH: number, aspect: number): Crop {
  const imgAspect = imgW / imgH;
  let widthPct: number;
  let heightPct: number;
  if (imgAspect > aspect) {
    heightPct = 80;
    widthPct = (heightPct * aspect) / imgAspect;
  } else {
    widthPct = 80;
    heightPct = (widthPct * imgAspect) / aspect;
  }
  return {
    unit: "%",
    x: (100 - widthPct) / 2,
    y: (100 - heightPct) / 2,
    width: widthPct,
    height: heightPct,
  };
}

/** Read a Blob as a base64 data URL (`data:<mime>;base64,...`). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Promise-wrapper around HTMLCanvasElement.toBlob. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.9,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas_to_blob_failed"));
      },
      type,
      quality,
    );
  });
}

/**
 * Compute the preview dimensions for ImageUpload based on the variant props.
 *   - circle: square `radius * 2`
 *   - rounded: `width × Math.round(width / ratio)`
 */
export function computeDimensions(props: {
  type: "circle" | "rounded";
  radius?: number;
  ratio?: number;
  width?: number;
}): { w: number; h: number } {
  if (props.type === "circle") {
    if (!props.radius || props.radius <= 0) {
      throw new Error("ImageUpload type='circle' requires positive radius");
    }
    const size = props.radius * 2;
    return { w: size, h: size };
  }
  if (!props.ratio || !props.width || props.ratio <= 0 || props.width <= 0) {
    throw new Error(
      "ImageUpload type='rounded' requires positive ratio and width",
    );
  }
  return { w: props.width, h: Math.round(props.width / props.ratio) };
}

/**
 * Apply rotation + zoom + crop to a source image, returning a canvas of the
 * exact output dimensions.
 *
 * Two-pass pipeline that mirrors what the user sees in the cropper:
 *   1. PREVIEW pass — render the source image into a natural-resolution
 *      canvas with the user's rotation + zoom applied, centred on the
 *      canvas. Same composition the cropper shows via CSS transform on
 *      <img>, just rasterised at full quality.
 *   2. CROP pass — copy the user's percent rect (which was authored against
 *      the un-transformed image's layout box, with the same aspect as the
 *      preview canvas) from the preview into the output canvas.
 */
// outputSize picks the EXPORT resolution from the cropped region's NATURAL pixels
// — so a high-resolution pick keeps its detail — instead of the small on-screen
// preview frame (which would downscale a 7680px image to the ~240px frame). The
// longest side is capped at maxDim to keep uploads reasonable for the web; aspect
// follows the crop rect (which the cropper constrains to the target ratio).
export function outputSize(
  image: HTMLImageElement,
  state: CropEditState,
  maxDim: number,
): { w: number; h: number } {
  const nW = image.naturalWidth || 1;
  const nH = image.naturalHeight || 1;
  const c = state.crop;
  const pct = c.unit === "%";
  let w = pct ? ((c.width ?? 100) / 100) * nW : (c.width ?? nW);
  let h = pct ? ((c.height ?? 100) / 100) * nH : (c.height ?? nH);
  if (w <= 0 || h <= 0) {
    w = nW;
    h = nH;
  }
  const longest = Math.max(w, h);
  if (maxDim > 0 && longest > maxDim) {
    const s = maxDim / longest;
    w *= s;
    h *= s;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

export function applyCropTransform(
  image: HTMLImageElement,
  state: CropEditState,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const naturalW = image.naturalWidth;
  const naturalH = image.naturalHeight;

  const preview = document.createElement("canvas");
  preview.width = naturalW;
  preview.height = naturalH;
  const pctx = preview.getContext("2d");
  if (!pctx) throw new Error("canvas_2d_unavailable");
  pctx.imageSmoothingEnabled = true;
  pctx.imageSmoothingQuality = "high";

  const zoom = state.zoom > 0 ? state.zoom : 1;
  const flipX = state.flipH ? -1 : 1;
  const flipY = state.flipV ? -1 : 1;
  pctx.save();
  // Pan applies LAST visually (outermost in the CSS chain), so on canvas it
  // goes FIRST — ctx.translate happens outside all subsequent transforms
  // relative to drawImage. Stored in natural pixels so this maps 1:1 onto
  // the natural-resolution canvas.
  pctx.translate(state.offsetX ?? 0, state.offsetY ?? 0);
  pctx.translate(naturalW / 2, naturalH / 2);
  pctx.rotate((state.rotation * Math.PI) / 180);
  pctx.scale(zoom * flipX, zoom * flipY);
  pctx.drawImage(image, -naturalW / 2, -naturalH / 2);
  pctx.restore();

  const output = document.createElement("canvas");
  output.width = outW;
  output.height = outH;
  const octx = output.getContext("2d");
  if (!octx) throw new Error("canvas_2d_unavailable");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";

  const isPercent = state.crop.unit === "%";
  const rawX = state.crop.x ?? 0;
  const rawY = state.crop.y ?? 0;
  const rawW = state.crop.width ?? (isPercent ? 100 : naturalW);
  const rawH = state.crop.height ?? (isPercent ? 100 : naturalH);
  const cropX = isPercent ? (rawX / 100) * naturalW : rawX;
  const cropY = isPercent ? (rawY / 100) * naturalH : rawY;
  const cropW = isPercent ? (rawW / 100) * naturalW : rawW;
  const cropH = isPercent ? (rawH / 100) * naturalH : rawH;

  octx.drawImage(preview, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  return output;
}
