import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, { type PercentCrop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { cn } from "@/lib/utils";

import type { CropEditState, ImageUploadType } from "../types";
import { defaultCrop } from "../utils";
import { ZOOM_WHEEL_STEP, clampZoom } from "../zoom";
import { CropToolbar } from "./CropToolbar";

interface Props {
  /** Source image URL (data URL or blob URL). */
  src: string;
  type: ImageUploadType;
  /** Locked aspect ratio: 1 for circle, w/h for rounded. */
  aspect: number;
  state: CropEditState;
  onChange: (state: CropEditState) => void;
  /** Last src that the parent has acknowledged as decoded. The cropper uses
   *  this to decide whether to (re-)seed the crop rect from defaultCrop on
   *  the next <img> load. Lifted out of local state so the parent can keep
   *  it across mount/unmount cycles (e.g. picker tab switches), preserving
   *  the user's edits when they leave a tab and come back. */
  loadedSrc: string | null;
  /** Called once `defaultCrop` has been applied for `src`. The parent must
   *  flip `loadedSrc` to this value so future loads of the same `src` skip
   *  the re-seed. */
  onLoadedSrcChange: (src: string) => void;
  disabled?: boolean;
}

/**
 * react-image-crop wrapper. The crop rectangle is locked to `aspect`; circle
 * previews additionally render a circular mask over the frame (`circularCrop`).
 *
 * Rotation/zoom/flip/pan apply as CSS transform on the <img> ONLY (not on a
 * wrapper). ReactCrop's mediaRef attaches to its internal child-wrapper div
 * and getBox() reads child-wrapper.getBoundingClientRect() — the wrapper
 * itself stays un-transformed, so getBox returns the un-transformed layout
 * rect and the percent crop math stays consistent with the visible selection.
 *
 * NOTE on data URLs: browsers can decode small data URLs synchronously when
 * `src` is set, firing `load` BEFORE React attaches the onLoad listener.
 * The useEffect below polls `img.complete && naturalWidth > 0` on every src
 * change as a fallback for that race; the onLoad attribute is the primary
 * path for cross-origin / network-loaded images.
 */
export function ImageCropper({
  src,
  type,
  aspect,
  state,
  onChange,
  loadedSrc,
  onLoadedSrcChange,
  disabled = false,
}: Props) {
  const imageReady = loadedSrc === src;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Latest-value refs for the pan handler. Without these the pan useEffect
  // would have to list `state` + `onChange` in its deps, which re-runs and
  // tears down the document-level pointermove listener on the FIRST onChange
  // call inside the drag — breaking the gesture after a single frame.
  const stateRef = useRef(state);
  stateRef.current = state;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // True while the user is actively dragging-to-pan. Used to disable the
  // CSS transition on the <img> so the image tracks the cursor 1:1 instead
  // of trailing 120 ms behind it.
  const [isPanning, setIsPanning] = useState(false);

  const handleCropChange = useCallback(
    (_pixel: PixelCrop, percent: PercentCrop) =>
      onChange({ ...state, crop: percent }),
    [onChange, state],
  );

  const applyDefaultCropFromImage = useCallback(
    (img: HTMLImageElement) => {
      const { naturalWidth, naturalHeight, src: imgSrc } = img;
      if (!naturalWidth || !naturalHeight) return;
      if (imgSrc === loadedSrc) return;
      onChange({
        crop: defaultCrop(naturalWidth, naturalHeight, aspect),
        rotation: 0,
        zoom: 1,
        flipH: false,
        flipV: false,
        offsetX: 0,
        offsetY: 0,
      });
      onLoadedSrcChange(imgSrc);
    },
    [aspect, onChange, loadedSrc, onLoadedSrcChange],
  );

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      applyDefaultCropFromImage(e.currentTarget);
    },
    [applyDefaultCropFromImage],
  );

  // Sync-load fallback for data URLs (see component header comment).
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0 && img.src !== loadedSrc) {
      applyDefaultCropFromImage(img);
    }
  }, [src, loadedSrc, applyDefaultCropFromImage]);

  // Mouse-wheel zoom. Attached as a NATIVE listener with `{ passive: false }`
  // because React's synthetic `onWheel` is registered passively by default
  // and can't preventDefault — without it the page scrolls while zooming.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP;
      const next = clampZoom(state.zoom + delta);
      if (next === state.zoom) return;
      onChange({ ...state, zoom: next });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [disabled, state, onChange]);

  // Pan: mouse-drag on <img> translates the image inside the cropper. We
  // stopPropagation on pointerdown so ReactCrop never sees the gesture —
  // otherwise it would start drawing a NEW crop rect on the empty area.
  // The selection's resize handles sit on top with their own listeners.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || disabled) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseOffsetX = 0;
    let baseOffsetY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      baseOffsetX = stateRef.current.offsetX;
      baseOffsetY = stateRef.current.offsetY;
      img.style.cursor = "grabbing";
      setIsPanning(true);
      e.stopPropagation();
      e.preventDefault();
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      // Convert screen-pixel deltas to natural-pixel offsets so the stored
      // state can be applied directly in applyCropTransform's canvas pipeline.
      const dispW = img.offsetWidth || 1;
      const dispH = img.offsetHeight || 1;
      const ratioX = img.naturalWidth / dispW;
      const ratioY = img.naturalHeight / dispH;
      onChangeRef.current({
        ...stateRef.current,
        offsetX: baseOffsetX + (e.clientX - startX) * ratioX,
        offsetY: baseOffsetY + (e.clientY - startY) * ratioY,
      });
    };
    const onPointerUp = () => {
      dragging = false;
      img.style.cursor = "grab";
      setIsPanning(false);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    img.style.cursor = "grab";
    img.addEventListener("pointerdown", onPointerDown);
    return () => {
      img.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      img.style.cursor = "";
    };
  }, [disabled]);

  const handleReset = useCallback(() => {
    onChange({
      ...state,
      rotation: 0,
      zoom: 1,
      flipH: false,
      flipV: false,
      offsetX: 0,
      offsetY: 0,
    });
  }, [onChange, state]);

  const displayRotation = ((state.rotation % 360) + 360) % 360;
  const hasRotation = displayRotation !== 0;
  const hasZoom = state.zoom !== 1;
  const hasFlip = state.flipH || state.flipV;
  const hasPan = state.offsetX !== 0 || state.offsetY !== 0;
  const showHint = hasRotation || hasZoom || hasFlip || hasPan;

  const hintParts: string[] = [];
  if (hasRotation) hintParts.push(`↻ ${displayRotation}°`);
  if (hasZoom) hintParts.push(`🔍 ${state.zoom.toFixed(2)}×`);
  if (state.flipH) hintParts.push("⇆");
  if (state.flipV) hintParts.push("⇅");
  if (hasPan) {
    const img = imgRef.current;
    const ratioX =
      img && img.naturalWidth > 0 ? img.offsetWidth / img.naturalWidth : 0;
    const ratioY =
      img && img.naturalHeight > 0 ? img.offsetHeight / img.naturalHeight : 0;
    const dispX = Math.round(state.offsetX * ratioX);
    const dispY = Math.round(state.offsetY * ratioY);
    hintParts.push(`✥ ${dispX},${dispY}`);
  }

  const img = imgRef.current;
  const panRatioX =
    img && img.naturalWidth > 0 ? img.offsetWidth / img.naturalWidth : 0;
  const panRatioY =
    img && img.naturalHeight > 0 ? img.offsetHeight / img.naturalHeight : 0;
  const panX = state.offsetX * panRatioX;
  const panY = state.offsetY * panRatioY;

  return (
    <div
      className={cn(
        "flex flex-col items-stretch",
        // Hide selection rect until <img> has decoded — the initial 80%/80%
        // percent rect is in image-bounding-rect space and would inherit the
        // source aspect (e.g. 16:9). applyDefaultCropFromImage swaps it for an
        // aspect-locked rect once naturalWidth is available.
        !imageReady && "[&_.ReactCrop__crop-selection]:opacity-0",
      )}
    >
      <div
        ref={stageRef}
        className={cn(
          "relative mx-auto flex max-h-[420px] w-full items-center justify-center overflow-hidden rounded-md bg-muted/40",
          type === "circle" ? "aspect-square max-w-[420px]" : "max-w-full",
        )}
      >
        <ReactCrop
          crop={state.crop}
          onChange={handleCropChange}
          aspect={aspect}
          circularCrop={type === "circle"}
          minWidth={64}
          disabled={disabled}
          keepSelection
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={handleImageLoad}
            // Transform order (applied right-to-left to the source pixels):
            //   1. scale(flipH?-1:1, flipV?-1:1) — mirror first
            //   2. rotate(state.rotation)        — then turn
            //   3. scale(state.zoom)             — then magnify
            //   4. translate(panX, panY)         — finally pan in screen space
            // Pan is OUTERMOST so drag distance equals on-screen movement
            // regardless of zoom. Keep this order in sync with
            // applyCropTransform's canvas pipeline.
            style={{
              display: "block",
              transform: `translate(${panX}px, ${panY}px) scale(${state.zoom}) rotate(${state.rotation}deg) scale(${
                state.flipH ? -1 : 1
              }, ${state.flipV ? -1 : 1})`,
              transformOrigin: "center",
              transition: isPanning ? "none" : "transform 0.12s ease-out",
              maxHeight: 420,
              maxWidth: "100%",
            }}
          />
        </ReactCrop>
      </div>

      {showHint && (
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {hintParts.map((part, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              {part}
            </span>
          ))}
        </div>
      )}

      <CropToolbar
        state={state}
        onChange={onChange}
        onReset={handleReset}
        disabled={disabled}
      />
    </div>
  );
}
