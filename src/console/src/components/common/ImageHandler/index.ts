// Public API for the ImageHandler module: a circle/rounded image picker with
// an internal modal (Upload / Camera / Illustrative tabs) and a crop editor
// (crop/zoom/rotate/flip/pan). Ported from the cinnamango reference; the only
// adaptation is the API client (@/services/api). Cross-module code imports
// only via this file.
export { ImageUpload } from "./ImageUpload";
export type { ImageUploadProps } from "./ImageUpload";

export { PickerModal } from "./picker/PickerModal";

export { useIllustrative } from "./hooks/useIllustrative";
export { useImageUpload } from "./hooks/useImageUpload";
export type { UploadAdapterResult } from "./hooks/useImageUpload";
export { uploadImageBlob } from "./uploadBlob";

export type {
  ImageUploadType,
  ImageUploadValue,
  CropEditState,
  IllustrativeData,
  IllustrativeCategory,
  IllustrativeItem,
} from "./types";

export {
  blobToDataUrl,
  canvasToBlob,
  computeDimensions,
  applyCropTransform,
  loadImage,
  defaultCrop,
} from "./utils";

export {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  ZOOM_WHEEL_STEP,
  clampZoom,
} from "./zoom";
