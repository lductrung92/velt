import { Camera, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Webcam from "react-webcam";

import { Button } from "@/components/ui/button";

import type { CropEditState, ImageUploadType } from "../types";
import { ImageCropper } from "./ImageCropper";

const WEBCAM_FORMAT = "image/jpeg" as const;
const WEBCAM_CONSTRAINTS = { facingMode: "user" } as const;

interface Props {
  type: ImageUploadType;
  aspect: number;
  cropState: CropEditState;
  onCropStateChange: (state: CropEditState) => void;

  /** Called once a snapshot has been taken. Parent stores blob+dataUrl in
   *  its camera tab slot — that slot is the single source of truth, so this
   *  component renders the webcam vs the cropper based purely on whether
   *  the parent has a snapshot. */
  onSelect: (sel: {
    blob: Blob;
    dataUrl: string;
    name: string;
    source: "camera";
  }) => void;
  /** Called when user clicks Retake. Parent must clear the camera tab slot
   *  so the next render shows the webcam again. */
  onClear: () => void;
  selectedDataUrl?: string;
  /** Persisted across mount/unmount by the parent's per-tab slot. */
  loadedSrc: string | null;
  onLoadedSrcChange: (src: string) => void;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// Webcam capture tab. react-webcam owns getUserMedia + stream lifecycle;
// after capture we hand the snapshot to ImageCropper. Render is fully driven
// by `selectedDataUrl` (the parent's camera-tab slot) — no internal snapshot
// state so a tab switch can't fall out of sync with the parent.
export function CameraTab({
  type,
  aspect,
  cropState,
  onCropStateChange,
  onSelect,
  onClear,
  selectedDataUrl,
  loadedSrc,
  onLoadedSrcChange,
}: Props) {
  const { t } = useTranslation();
  const camRef = useRef<Webcam>(null);
  const [error, setError] = useState<string | null>(null);
  // Separate the hard "camera unavailable/denied" state (which must disable
  // shooting) from a transient shoot error (which must NOT permanently disable).
  const [denied, setDenied] = useState(false);

  const handleShoot = useCallback(async () => {
    const dataUrl = camRef.current?.getScreenshot();
    if (!dataUrl) {
      setError(t("image.upload.errors.shoot_failed"));
      return;
    }
    setError(null);
    try {
      const blob = await dataUrlToBlob(dataUrl);
      onSelect({ blob, dataUrl, name: "camera.jpg", source: "camera" });
    } catch {
      setError(t("image.upload.errors.shoot_failed"));
    }
  }, [onSelect, t]);

  const handleRetake = useCallback(() => {
    onClear();
    setError(null);
  }, [onClear]);

  return (
    <div className="flex flex-col gap-3">
      {!selectedDataUrl ? (
        <>
          <div className="overflow-hidden rounded-md bg-muted/40">
            <Webcam
              ref={camRef}
              audio={false}
              screenshotFormat={WEBCAM_FORMAT}
              videoConstraints={WEBCAM_CONSTRAINTS}
              onUserMedia={() => {
                setDenied(false);
                setError(null);
              }}
              onUserMediaError={() => {
                setDenied(true);
                setError(t("image.upload.errors.camera_denied"));
              }}
              style={{
                width: "100%",
                maxHeight: 360,
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleShoot}
              disabled={denied}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              {t("image.upload.actions.shoot")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ImageCropper
            src={selectedDataUrl}
            type={type}
            aspect={aspect}
            state={cropState}
            onChange={onCropStateChange}
            loadedSrc={loadedSrc}
            onLoadedSrcChange={onLoadedSrcChange}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mx-auto gap-1"
            onClick={handleRetake}
          >
            <RefreshCw className="h-4 w-4" />
            {t("image.upload.actions.retake")}
          </Button>
        </>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  );
}
