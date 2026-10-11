import type { Editor } from "@tiptap/react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseApiError } from "@/utils/apiError";

import { useUploadArticleMedia } from "../hooks/useCmsArticles";

// Toolbar button for the article body editor.
//
// On a saved article the image uploads straight away to
// /cms/articles/{id}/upload?purpose=inline and the returned URL is inserted.
// On a draft that has never been saved there is no owner folder yet, so the
// image is inserted under a local object URL and handed to `onDeferred`; the
// editor uploads it and rewrites the body after the article is created.
// Dropped images are reclaimed server-side on the next save (gcInlineMedia).
export function ArticleImageButton({
  editor,
  articleId,
  onDeferred,
}: {
  editor: Editor | null;
  articleId?: string;
  onDeferred?: (pending: { url: string; file: File }) => void;
}) {
  const { t } = useTranslation();
  const upload = useUploadArticleMedia();
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = !editor || upload.isPending || (!articleId && !onDeferred);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file || !editor) return;
    if (!articleId) {
      const url = URL.createObjectURL(file);
      onDeferred?.({ url, file });
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      return;
    }
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
        title={t("editor.image")}
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
