import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { parseApiError } from "@/utils/apiError";

import { useUploadArticleMedia } from "./useCmsArticles";

/** What the editor needs to show an image: where it lives, and what it is. */
export interface InlineImage {
  src: string;
  alt: string;
}

/**
 * One image on its way into an article body.
 *
 * Two callers need the same two rules — the toolbar's insert button and the
 * replace button on a selected image — and the rules are not obvious: on a
 * saved article the file uploads to the article's own folder, while on a draft
 * that has never been saved there is no folder yet, so the image goes in under
 * a local object URL and the caller uploads it after the first save. Writing
 * that twice is how one of the two ends up forgetting the draft case.
 */
export function useInlineImage({
  articleId,
  onDeferred,
}: {
  articleId?: string;
  onDeferred?: (pending: { url: string; file: File }) => void;
}) {
  const { t } = useTranslation();
  const upload = useUploadArticleMedia();

  const take = useCallback(
    async (file: File): Promise<InlineImage | null> => {
      if (!articleId) {
        const url = URL.createObjectURL(file);
        onDeferred?.({ url, file });
        return { src: url, alt: file.name };
      }
      try {
        const res = await upload.mutateAsync({
          id: articleId,
          file,
          purpose: "inline",
        });
        return { src: res.url, alt: file.name };
      } catch (err) {
        toast.error(parseApiError(err, t).message);
        return null;
      }
    },
    [articleId, onDeferred, upload, t],
  );

  /** Opens the file dialog and resolves once a file comes back (or never). */
  const pick = useCallback(async (): Promise<InlineImage | null> => {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.addEventListener("change", () =>
        resolve(input.files?.[0] ?? null),
      );
      // Not every browser fires `cancel`; one that does not simply leaves the
      // promise pending, which is the same as the reader changing their mind.
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
    return file ? take(file) : null;
  }, [take]);

  return { take, pick, isPending: upload.isPending, ready: !!articleId || !!onDeferred };
}
