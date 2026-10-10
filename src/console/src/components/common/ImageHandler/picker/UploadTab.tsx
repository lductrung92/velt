import { Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { CropEditState, ImageUploadType } from "../types";
import { ImageCropper } from "./ImageCropper";
import { ImageUploadHelp } from "./ImageUploadHelp";

interface Selection {
  blob: Blob;
  dataUrl: string;
  /** Original filename so we can surface it on Apply. */
  name: string;
  source: "upload" | "illustrative" | "camera";
  /** URL of the chosen illustrative item (only when source === 'illustrative'). */
  originUrl?: string;
}

interface Props {
  accept: string;
  maxSizeMb: number;
  /** Fired once a file passes validation; parent stores the selection so
   *  Apply can promote it to the modal output. */
  onSelect: (sel: Selection) => void;
  /** Currently picked selection (rendered as cropper). */
  selection: Selection | null;

  type: ImageUploadType;
  aspect: number;
  cropState: CropEditState;
  onCropStateChange: (state: CropEditState) => void;
  /** Hoisted out of ImageCropper so it survives picker tab switches; the
   *  parent stores it in the tab's slot and replays it on remount. */
  loadedSrc: string | null;
  onLoadedSrcChange: (src: string) => void;
  /** When false, skip the crop editor and just preview the picked image — it is
   *  uploaded at full resolution (cropping left to CSS at render time). */
  crop?: boolean;
}

// Drop zone + hidden file input. Validates size and MIME inline; on success
// reads the file into a data URL for instant preview and bubbles up the blob
// via `onSelect`. Clipboard paste support is scoped to the dropzone-visible
// state so an accidental Ctrl+V while editing the crop doesn't wipe the
// user's framing.
export function UploadTab({
  accept,
  maxSizeMb,
  onSelect,
  selection,
  type,
  aspect,
  cropState,
  onCropStateChange,
  loadedSrc,
  onLoadedSrcChange,
  crop = true,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptedMimes = accept
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const maxBytes = maxSizeMb * 1024 * 1024;

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!acceptedMimes.includes(file.type)) {
        setError(t("image.upload.errors.invalid_mime"));
        return;
      }
      if (file.size > maxBytes) {
        setError(t("image.upload.errors.too_large"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        onSelect({
          blob: file,
          dataUrl: reader.result as string,
          name: file.name,
          source: "upload",
        });
      };
      reader.onerror = () => setError(t("image.upload.errors.read_failed"));
      reader.readAsDataURL(file);
    },
    [acceptedMimes, maxBytes, onSelect, t],
  );

  // Clipboard paste support — works while the drop zone is visible (i.e. no
  // upload-source selection yet). Listening on `document` so the user can
  // paste from anywhere on the picker (Snipping Tool / Lightshot etc.).
  const dropzoneVisible = !selection || selection.source !== "upload";
  useEffect(() => {
    if (!dropzoneVisible) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [dropzoneVisible, handleFile]);

  return (
    <div className="flex flex-col">
      <ImageUploadHelp accept={accept} maxSizeMb={maxSizeMb} />

      {selection && selection.source === "upload" ? (
        <div className="flex flex-col gap-3">
          {crop ? (
            <ImageCropper
              src={selection.dataUrl}
              type={type}
              aspect={aspect}
              state={cropState}
              onChange={onCropStateChange}
              loadedSrc={loadedSrc}
              onLoadedSrcChange={onLoadedSrcChange}
            />
          ) : (
            <img
              src={selection.dataUrl}
              alt=""
              className="mx-auto max-h-80 w-full rounded-md object-contain"
            />
          )}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mx-auto gap-1"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {t("image.upload.help.pick_another")}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input bg-background px-6 py-10 text-sm text-muted-foreground transition-colors",
            "hover:border-primary hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isDragging && "border-primary bg-accent text-foreground",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <Upload className="h-8 w-8" />
          <span className="font-medium text-foreground">
            {t("image.upload.help.drop_or_click")}
          </span>
          <span className="text-xs">{t("image.upload.help.paste_hint")}</span>
        </button>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export type { Selection as UploadSelection };
