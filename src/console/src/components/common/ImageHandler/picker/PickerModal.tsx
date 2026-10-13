import { Camera, Image as ImageIcon, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  useImageUpload,
  type UploadAdapterResult,
} from "../hooks/useImageUpload";
import type {
  CropEditState,
  ImageUploadType,
  ImageUploadValue,
} from "../types";
import {
  applyCropTransform,
  blobToDataUrl,
  canvasToBlob,
  loadImage,
  outputSize,
} from "../utils";
import { CameraTab } from "./CameraTab";
import { IllustrativeTab } from "./IllustrativeTab";
import { UploadTab, type UploadSelection } from "./UploadTab";

// Initial crop is a centred 80% percent rect. Percent values render on first
// paint without needing the image's intrinsic dimensions; ImageCropper hides
// the selection rect until <img> onLoad fires so the user only ever sees the
// aspect-locked rect emitted by defaultCrop().
const INITIAL_CROP_STATE: CropEditState = {
  crop: { unit: "%", x: 10, y: 10, width: 80, height: 80 },
  rotation: 0,
  zoom: 1,
  flipH: false,
  flipV: false,
  offsetX: 0,
  offsetY: 0,
};

const ILLUSTRATIVE_FALLBACK_NAME = "illustrative-item";

type TabKey = "illustrative" | "upload" | "camera";

// Per-tab state. Each tab owns its own selection + cropper edits + the
// `loadedSrc` flag (lifted out of ImageCropper so a tab switch doesn't reset
// the user's edits when ImageCropper remounts). Switching tabs only swaps
// which slot is "active"; Apply uses the active slot exclusively.
interface TabSlot {
  selection: UploadSelection | null;
  cropState: CropEditState;
  loadedSrc: string | null;
}

const FRESH_SLOT: TabSlot = {
  selection: null,
  cropState: INITIAL_CROP_STATE,
  loadedSrc: null,
};

function freshSlots(): Record<TabKey, TabSlot> {
  return {
    illustrative: FRESH_SLOT,
    upload: FRESH_SLOT,
    camera: FRESH_SLOT,
  };
}

export interface PickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Result emitted when user clicks Apply. When uploadUrl is set the modal
   *  POSTs the cropped blob first and emits kind:'uploaded'; otherwise it
   *  emits kind:'pending' so the parent form drives the upload. */
  onApply: (value: ImageUploadValue) => void;

  type: ImageUploadType;
  radius?: number;
  ratio?: number;
  width?: number;

  accept: string;
  maxSizeMb: number;

  illustrativePath?: string;
  uploadUrl?: string;
  uploadResponseAdapter?: (response: unknown) => UploadAdapterResult;
  /** Forwarded to the upload endpoint — content images need `"public"` or the
   *  public URL 403s. Omit for private endpoints (avatar). */
  uploadVisibility?: "public" | "private";
  /** Optional storage-key prefix forwarded to the upload endpoint. */
  uploadPrefix?: string;
  /** Show the webcam "camera" tab when the browser supports it. Default
   *  true; pass false to hide capture entirely (e.g. CMS article images). */
  showCamera?: boolean;
  /** Crop/transform mode. Default true → the crop+zoom+rotate editor, output
   *  re-rendered at the crop's natural resolution (capped by outputMax). false →
   *  NO transform: the original picked file is uploaded at full resolution and
   *  cropping is left to CSS object-fit at render time (best for backgrounds/
   *  banners where downscaling the source is undesirable). */
  crop?: boolean;
  /** When cropping, cap the exported image's longest side (px). Default 2560.
   *  0 = no cap → export at the crop's native resolution (no downscale). */
  outputMax?: number;
}

// Default-active tab priority: illustrative > upload. Camera never wins by
// default — even when available — because it triggers a permission prompt
// the user wasn't asking for.
function pickInitialTab(hasIllustrative: boolean): TabKey {
  return hasIllustrative ? "illustrative" : "upload";
}

export function PickerModal(props: PickerModalProps) {
  const { isOpen, onClose, onApply, accept, maxSizeMb, illustrativePath } =
    props;
  const { t } = useTranslation();

  const hasIllustrative = !!illustrativePath;
  const hasCamera =
    (props.showCamera ?? true) &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices;
  // Upload is always present; the other two are conditional. With a single
  // tab there's nothing to switch between → hide the tab bar entirely.
  const tabCount = [hasIllustrative, true, hasCamera].filter(Boolean).length;

  const [tab, setTab] = useState<TabKey>(() => pickInitialTab(hasIllustrative));
  const [slots, setSlots] = useState<Record<TabKey, TabSlot>>(freshSlots);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const current = slots[tab];

  const aspect = useMemo(() => {
    if (props.type === "circle") return 1;
    return props.ratio ?? 1;
  }, [props.type, props.ratio]);

  const upload = useImageUpload({
    uploadUrl: props.uploadUrl ?? "",
    responseAdapter: props.uploadResponseAdapter,
    visibility: props.uploadVisibility,
    prefix: props.uploadPrefix,
  });

  const setSlotSelection = useCallback(
    (key: TabKey, sel: UploadSelection | null) => {
      setSlots((prev) => ({
        ...prev,
        [key]: {
          selection: sel,
          cropState: INITIAL_CROP_STATE,
          loadedSrc: null,
        },
      }));
    },
    [],
  );
  const patchSlot = useCallback((key: TabKey, patch: Partial<TabSlot>) => {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // Reset everything when the modal closes so reopening starts clean.
  useEffect(() => {
    if (!isOpen) {
      setSlots(freshSlots());
      setApplyError(null);
      setTab(pickInitialTab(hasIllustrative));
    }
  }, [isOpen, hasIllustrative]);

  // Apply uses the ACTIVE tab's slot only — switching tabs swaps which slot
  // feeds Apply, so picking an illustrative item never propagates into the
  // upload or camera output.
  const handleApply = useCallback(async () => {
    const sel = current.selection;
    if (!sel) return;
    setApplying(true);
    setApplyError(null);
    try {
      let blob: Blob;
      let dataUrl: string;
      if (props.crop === false) {
        // No transform: keep the original picked file at full resolution
        // (cropping is handled by CSS object-fit at render time).
        blob = await (await fetch(sel.dataUrl)).blob();
        dataUrl = sel.dataUrl;
      } else {
        const img = await loadImage(sel.dataUrl);
        const cap = props.outputMax ?? 2560;
        const out = outputSize(img, current.cropState, cap);
        const canvas = applyCropTransform(img, current.cropState, out.w, out.h);
        // Preserve transparency: only JPEG-encode a source that was already JPEG.
        // A PNG/WebP/GIF re-encoded to JPEG turns transparent pixels black (e.g. a
        // transparent logo → black box), so keep those lossless as PNG. (Animated
        // GIFs still collapse to one frame — a canvas limitation.)
        const srcType = sel.dataUrl.slice(5, sel.dataUrl.indexOf(";"));
        const asJpeg = srcType === "image/jpeg";
        // native-resolution intent (cap=0) → higher JPEG quality to minimise the
        // re-encode loss; capped/thumbnail path stays at the lighter 0.9.
        blob = asJpeg
          ? await canvasToBlob(canvas, "image/jpeg", cap === 0 ? 0.95 : 0.9)
          : await canvasToBlob(canvas, "image/png");
        dataUrl = await blobToDataUrl(blob);
      }

      if (props.uploadUrl) {
        const { fileId, url } = await upload.mutateAsync(blob);
        onApply({ kind: "uploaded", fileId, url });
      } else {
        onApply({ kind: "pending", dataUrl, blob });
      }
      onClose();
    } catch {
      setApplyError(t("image.upload.errors.apply_failed"));
    } finally {
      setApplying(false);
    }
  }, [
    current.selection,
    current.cropState,
    props.type,
    props.radius,
    props.ratio,
    props.width,
    props.uploadUrl,
    upload,
    onApply,
    onClose,
    t,
  ]);

  const applyDisabled = !current.selection || applying;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-4 p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t("image.upload.modal_title")}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabKey)}
          className="px-6"
        >
          {/* Tab count is dynamic: illustrative hides when no `illustrativePath`
              is passed (was disabled-but-visible — confusing UX), camera hides
              when navigator.mediaDevices is undefined / showCamera=false.
              Tailwind purges dynamic `grid-cols-${n}` so the column count is
              mapped explicitly. With a single tab the bar is hidden entirely. */}
          {tabCount > 1 && (
            <TabsList
              className={cn(
                "grid w-full",
                tabCount === 2 ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              {hasIllustrative && (
                <TabsTrigger value="illustrative" className="gap-2">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  {t("image.upload.tabs.illustrative")}
                </TabsTrigger>
              )}
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {t("image.upload.tabs.upload")}
              </TabsTrigger>
              {hasCamera && (
                <TabsTrigger value="camera" className="gap-2">
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  {t("image.upload.tabs.camera")}
                </TabsTrigger>
              )}
            </TabsList>
          )}

          <TabsContent value="upload" className="mt-4">
            <UploadTab
              accept={accept}
              maxSizeMb={maxSizeMb}
              onSelect={(sel) => setSlotSelection("upload", sel)}
              selection={slots.upload.selection}
              type={props.type}
              aspect={aspect}
              cropState={slots.upload.cropState}
              onCropStateChange={(cs) => patchSlot("upload", { cropState: cs })}
              loadedSrc={slots.upload.loadedSrc}
              onLoadedSrcChange={(src) =>
                patchSlot("upload", { loadedSrc: src })
              }
              crop={props.crop !== false}
            />
          </TabsContent>

          <TabsContent value="illustrative" className="mt-4">
            {illustrativePath && (
              <IllustrativeTab
                path={illustrativePath}
                onSelect={async (item) => {
                  // Round-trip the item URL into the same selection shape as
                  // UploadTab so Apply has one code path. fetch() respects
                  // CORS for cross-origin assets; same-origin (the common
                  // case for shipped JSON) just streams directly.
                  try {
                    const res = await fetch(item.url);
                    const blob = await res.blob();
                    const reader = new FileReader();
                    reader.onload = () => {
                      setSlotSelection("illustrative", {
                        blob,
                        dataUrl: reader.result as string,
                        name:
                          item.url.split("/").pop() ??
                          ILLUSTRATIVE_FALLBACK_NAME,
                        source: "illustrative",
                        originUrl: item.url,
                      });
                    };
                    reader.readAsDataURL(blob);
                  } catch {
                    setApplyError(t("image.upload.errors.fetch_failed"));
                  }
                }}
                selectedUrl={slots.illustrative.selection?.originUrl}
              />
            )}
          </TabsContent>

          <TabsContent value="camera" className="mt-4">
            {hasCamera && (
              <CameraTab
                type={props.type}
                aspect={aspect}
                cropState={slots.camera.cropState}
                onCropStateChange={(cs) =>
                  patchSlot("camera", { cropState: cs })
                }
                onSelect={(sel) => setSlotSelection("camera", sel)}
                onClear={() => setSlotSelection("camera", null)}
                selectedDataUrl={slots.camera.selection?.dataUrl}
                loadedSrc={slots.camera.loadedSrc}
                onLoadedSrcChange={(src) =>
                  patchSlot("camera", { loadedSrc: src })
                }
              />
            )}
          </TabsContent>
        </Tabs>

        {applyError && (
          <div
            role="alert"
            className="mx-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {applyError}
          </div>
        )}

        <DialogFooter className="mt-0 border-t bg-muted/30 px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("image.upload.actions.cancel")}
          </Button>
          <Button type="button" disabled={applyDisabled} onClick={handleApply}>
            {t("image.upload.actions.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
