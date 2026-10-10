import {
  FlipHorizontal,
  FlipVertical,
  RefreshCw,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { CropEditState } from "../types";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom } from "../zoom";

interface Props {
  state: CropEditState;
  onChange: (state: CropEditState) => void;
  /** Reset rotation+zoom+flip+pan to defaults. Crop frame is preserved on
   *  purpose so the user does not lose their framing decision. */
  onReset: () => void;
  disabled?: boolean;
}

// 45° per click. The state value accumulates (never wraps via %360) so the
// CSS transition on the <img> always runs forward — going from 315° to 360°
// keeps spinning clockwise instead of snapping back through 0°. The hint
// badge in ImageCropper normalises the displayed degrees to 0–315.
const ROTATION_STEP = 45;

export function CropToolbar({
  state,
  onChange,
  onReset,
  disabled = false,
}: Props) {
  const { t } = useTranslation();

  function rotate(delta: number) {
    onChange({ ...state, rotation: state.rotation + delta });
  }

  function setZoom(value: number) {
    onChange({ ...state, zoom: clampZoom(value) });
  }

  return (
    <div className="mt-3 flex items-center gap-3 px-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("image.upload.actions.rotate_left")}
          title={t("image.upload.actions.rotate_left")}
          disabled={disabled}
          onClick={() => rotate(-ROTATION_STEP)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("image.upload.actions.rotate_right")}
          title={t("image.upload.actions.rotate_right")}
          disabled={disabled}
          onClick={() => rotate(ROTATION_STEP)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={state.flipH ? "default" : "outline"}
          size="icon"
          className="h-8 w-8"
          aria-label={t("image.upload.actions.flip_horizontal")}
          aria-pressed={state.flipH}
          title={t("image.upload.actions.flip_horizontal")}
          disabled={disabled}
          onClick={() => onChange({ ...state, flipH: !state.flipH })}
        >
          <FlipHorizontal className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={state.flipV ? "default" : "outline"}
          size="icon"
          className="h-8 w-8"
          aria-label={t("image.upload.actions.flip_vertical")}
          aria-pressed={state.flipV}
          title={t("image.upload.actions.flip_vertical")}
          disabled={disabled}
          onClick={() => onChange({ ...state, flipV: !state.flipV })}
        >
          <FlipVertical className="h-4 w-4" />
        </Button>
      </div>

      <label className="flex flex-1 items-center gap-2">
        <span className="sr-only">{t("image.upload.actions.zoom")}</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={state.zoom}
          disabled={disabled}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          aria-label={t("image.upload.actions.zoom")}
          className={cn(
            "h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted",
            "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
          )}
        />
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(state.zoom * 100)}%
        </span>
      </label>

      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto gap-1 p-0"
        aria-label={t("image.upload.actions.reset")}
        title={t("image.upload.actions.reset")}
        disabled={disabled}
        onClick={onReset}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t("image.upload.actions.reset")}
      </Button>
    </div>
  );
}
