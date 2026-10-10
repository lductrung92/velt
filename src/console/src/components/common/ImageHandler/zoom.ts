/**
 * Zoom constants shared by every input that mutates `CropEditState.zoom`
 * (slider in CropToolbar, wheel-on-stage in ImageCropper, keyboard shortcuts).
 * Centralised so the toolbar and the wheel handler can't drift apart and
 * surprise the user with different caps on different inputs.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** Slider step. Smooth enough that dragging feels continuous. */
export const ZOOM_STEP = 0.01;

/**
 * Wheel step — coarser than the slider so a single wheel tick produces a
 * visible change. Mouse wheels emit at most a few deltas per second, so a
 * 0.01-per-tick step would feel sluggish.
 */
export const ZOOM_WHEEL_STEP = 0.1;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
