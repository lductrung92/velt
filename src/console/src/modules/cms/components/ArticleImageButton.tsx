import type { Editor } from "@tiptap/react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseApiError } from "@/utils/apiError";

import { useUploadArticleMedia } from "../hooks/useCmsArticles";

// Toolbar button for the article body editor: pick an image → upload immediately
// to /cms/articles/{id}/upload?purpose=inline → insert an <img> with the returned
// CDN URL. Disabled until the article has an id (a brand-new draft must be saved
// first, so the upload has an owner folder) — the tooltip explains why. Dropped
// images are reclaimed server-side on the next save (see backend gcInlineMedia).
export function ArticleImageButton({
  editor,
  articleId,
}: {
  editor: Editor | null;
  articleId?: string;
}) {
  const { t } = useTranslation();
  const upload = useUploadArticleMedia();
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = !editor || !articleId || upload.isPending;

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file || !editor || !articleId) return;
    try {
      const res = await upload.mutateAsync({ id: articleId, file, purpose: "inline" });
      editor.chain().focus().setImage({ src: res.url, alt: file.name }).run();
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("editor.image")}
        title={articleId ? t("editor.image") : t("cms.articles.image_needs_save")}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {upload.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ImagePlus className="size-4" />
        )}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onPick}
      />
    </>
  );
}
