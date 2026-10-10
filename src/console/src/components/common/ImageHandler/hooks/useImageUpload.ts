import { useMutation } from "@tanstack/react-query";

import api from "@/services/api";

export interface UploadAdapterResult {
  fileId: string;
  url: string;
}

/**
 * Default response adapter assumes the backend returns a FileResponse-shaped
 * object (`id`, `url`). Pages with a different shape (e.g.
 * AvatarResponse for the avatar endpoint) override `responseAdapter`
 * on ImageUpload props.
 */
const defaultAdapter = (response: unknown): UploadAdapterResult => {
  const r = response as { id?: string; url?: string };
  if (!r?.id || !r?.url) {
    throw new Error("upload_response_missing_fields");
  }
  return { fileId: r.id, url: r.url };
};

interface Options {
  uploadUrl: string;
  responseAdapter?: (response: unknown) => UploadAdapterResult;
  /** Field name in the FormData. Backends typically expect "file". */
  fieldName?: string;
  /** Filename hint sent with the multipart part. */
  filename?: string;
  /**
   * `/files/upload` defaults to `private` — content images that must render
   * on public pages have to send `visibility="public"` or the public URL
   * 403s. Omit for endpoints that don't take it (e.g. the avatar endpoint,
   * which is always private).
   */
  visibility?: "public" | "private";
  /** Optional storage-key prefix the BE namespaces the object under
   *  (e.g. `gallery/{id}/`) so the public CDN prefix allowlist matches. */
  prefix?: string;
}

/**
 * POST a Blob via multipart/form-data to `uploadUrl`. Returns `{ fileId, url }`
 * after the response is shaped by the adapter.
 */
export function useImageUpload({
  uploadUrl,
  responseAdapter = defaultAdapter,
  fieldName = "file",
  filename = "image.jpg",
  visibility,
  prefix,
}: Options) {
  return useMutation({
    mutationFn: async (blob: Blob): Promise<UploadAdapterResult> => {
      const fd = new FormData();
      fd.append(fieldName, blob, filename);
      // Only append when set so endpoints that don't accept these fields
      // (avatar) keep their current, working request shape.
      if (visibility) fd.append("visibility", visibility);
      if (prefix) fd.append("prefix", prefix);
      const res = await api.post(uploadUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return responseAdapter(res.data);
    },
  });
}
