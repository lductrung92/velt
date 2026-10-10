import api from "@/services/api";

/**
 * Upload a Blob to `/files/upload` and return the new file id. Plain async
 * (not a hook) so it can run inside form-save handlers and config walkers
 * where deferred image blobs are flushed on save. Mirrors the multipart shape
 * of `useImageUpload`.
 *
 * NOTE: requires the backend `/files/upload` endpoint. The avatar flow does
 * NOT use this — it uploads to `/account/avatar` via `useImageUpload`. Content
 * images (materials/games covers) will use this once the files module ships an
 * upload endpoint.
 */
export async function uploadImageBlob(
  blob: Blob,
  opts: {
    visibility?: "public" | "private";
    prefix?: string;
    filename?: string;
  } = {},
): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, opts.filename ?? "image.jpg");
  if (opts.visibility) fd.append("visibility", opts.visibility);
  if (opts.prefix) fd.append("prefix", opts.prefix);
  const res = await api.post("/files/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const r = res.data as { id?: string };
  if (!r?.id) throw new Error("upload_response_missing_fields");
  return r.id;
}
