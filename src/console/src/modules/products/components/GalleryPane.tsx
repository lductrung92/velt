import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ImageIcon,
  ImagePlus,
  Pencil,
  Play,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ModalHeader } from "@/components/common/ModalHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/utils/apiError";
import { fileUrl } from "@/utils/fileUrl";

import {
  useAddGalleryImage,
  useAddGalleryVideo,
  useRemoveGalleryItem,
  useReorderGallery,
  useUpdateGalleryCaption,
} from "../hooks/useProducts";
import type { ProductMedia } from "../services/products.service";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

// A pinned round control over the thumbnail, the same affordance the cover
// image carries (see ImageUpload): a disc that reads on any photo.
const ACTION_BTN =
  "absolute z-10 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// A watch link does not render inside an <iframe>; each provider serves its
// player from another path. Returns null for anything we cannot embed, which
// is also what hides the preview control.
function embedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return `https://www.youtube.com/embed${u.pathname}`;
  if (host === "youtube.com") {
    if (u.pathname.startsWith("/embed/")) return raw;
    const v = u.searchParams.get("v");
    return v ? `https://www.youtube.com/embed/${v}` : null;
  }
  if (host === "vimeo.com")
    return `https://player.vimeo.com/video${u.pathname}`;
  if (host === "player.vimeo.com") return raw;
  return null;
}

/** The fields a card renders — satisfied by both a saved row and a local draft. */
type GalleryCardItem = Pick<
  ProductMedia,
  "id" | "kind" | "url" | "video_url" | "caption"
>;

/** A gallery entry picked before the product exists. `file` is the blob waiting
 *  to be uploaded; `url` is its object URL, used only for the preview. */
export type GalleryDraftItem = GalleryCardItem & {
  caption: string;
  file?: File;
};

function Card({
  item,
  disabled,
  onCaption,
  onRemove,
  onReplaceImage,
  onEditVideo,
  onPreview,
}: {
  item: GalleryCardItem;
  disabled?: boolean;
  onCaption: (caption: string) => void;
  onRemove: () => void;
  onReplaceImage: (file: File) => void;
  onEditVideo: () => void;
  onPreview: (embed: string) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });
  const [caption, setCaption] = useState(item.caption ?? "");
  useEffect(() => setCaption(item.caption ?? ""), [item.caption]);
  const replaceRef = useRef<HTMLInputElement>(null);
  const embed = item.kind === "video" ? embedUrl(item.video_url ?? "") : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-background p-2",
        isDragging && "opacity-50",
      )}
      data-testid="gallery-item"
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-md bg-muted">
        {item.kind === "image" && item.url ? (
          <img
            src={fileUrl(item.url)}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-xs text-muted-foreground">
            <Video className="size-6" aria-hidden />
            <span className="line-clamp-2 break-all">{item.video_url}</span>
          </div>
        )}
        {!disabled && (
          <button
            type="button"
            aria-label={t("products.gallery.reorder")}
            className="absolute left-1 top-1 cursor-grab touch-none rounded bg-background/80 p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        {/* Watching the video is not an edit, so it stays available read-only. */}
        {embed && (
          <button
            type="button"
            aria-label={t("products.gallery.preview")}
            title={t("products.gallery.preview")}
            className={cn(ACTION_BTN, "bottom-1 left-1")}
            onClick={() => onPreview(embed)}
          >
            <Play className="size-3.5" />
          </button>
        )}
        {!disabled && (
          <>
            <button
              type="button"
              aria-label={t("common.remove")}
              title={t("common.remove")}
              className={cn(
                ACTION_BTN,
                "right-1 top-1 hover:bg-destructive hover:text-destructive-foreground",
              )}
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </button>
            {item.kind === "image" ? (
              <>
                <input
                  ref={replaceRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // allow re-picking the same file
                    if (file) onReplaceImage(file);
                  }}
                />
                <button
                  type="button"
                  aria-label={t("products.gallery.replace")}
                  title={t("products.gallery.replace")}
                  className={cn(ACTION_BTN, "bottom-1 right-1")}
                  onClick={() => replaceRef.current?.click()}
                >
                  <ImageIcon className="size-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-label={t("products.gallery.replace_video")}
                title={t("products.gallery.replace_video")}
                className={cn(ACTION_BTN, "bottom-1 right-1")}
                onClick={onEditVideo}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </>
        )}
      </div>
      <Input
        value={caption}
        disabled={disabled}
        maxLength={300}
        placeholder={t("products.gallery.caption_ph")}
        aria-label={t("products.gallery.caption")}
        onChange={(e) => setCaption(e.target.value)}
        // Caption is server state, not form state: commit on blur rather than
        // on every keystroke so the editor is not chatty.
        onBlur={() => caption !== (item.caption ?? "") && onCaption(caption)}
      />
    </div>
  );
}

// A product's gallery: an ordered mix of uploaded images and embedded videos.
//
// Two modes, same UI. With a `productId` every change is server state, saved the
// moment it happens. With `productId === null` the product has not been created
// yet, so changes accumulate in `draft` (owned by the editor) and are uploaded
// once, in order, after the first save.
export function GalleryPane({
  productId,
  items,
  draft = [],
  onDraftChange,
  disabled,
}: {
  productId: string | null;
  items: ProductMedia[];
  draft?: GalleryDraftItem[];
  onDraftChange?: (next: GalleryDraftItem[]) => void;
  disabled?: boolean;
}) {
  const isDraft = productId === null;
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  // null = closed, { id: null } = adding, { id } = changing that entry's link.
  const [videoEdit, setVideoEdit] = useState<{ id: string | null } | null>(
    null,
  );
  const [videoUrl, setVideoUrl] = useState("");
  const [videoCaption, setVideoCaption] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const addImage = useAddGalleryImage();
  const addVideo = useAddGalleryVideo();
  const setCaption = useUpdateGalleryCaption();
  const remove = useRemoveGalleryItem();
  const reorder = useReorderGallery();

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<ProductMedia[]>(items);
  useEffect(() => setOrder(items), [items]);

  // What the grid renders. In draft mode the editor owns the list.
  const view: GalleryCardItem[] = isDraft ? draft : order;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fail = (err: unknown) => toast.error(parseApiError(err, t).message);

  const dropDraft = (mediaId: string) => {
    const gone = draft.find((d) => d.id === mediaId);
    // The preview holds a blob alive until it is revoked.
    if (gone?.url) URL.revokeObjectURL(gone.url);
    onDraftChange?.(draft.filter((d) => d.id !== mediaId));
  };

  const appendDraft = (item: Omit<GalleryDraftItem, "id">) =>
    onDraftChange?.([
      ...draft,
      { ...item, id: `draft-${crypto.randomUUID()}` },
    ]);

  const patchDraftItem = (
    mediaId: string,
    patch: Partial<GalleryDraftItem>,
  ) => {
    const old = draft.find((d) => d.id === mediaId);
    // The preview holds a blob alive until it is revoked.
    if (patch.url && old?.url) URL.revokeObjectURL(old.url);
    onDraftChange?.(
      draft.map((d) => (d.id === mediaId ? { ...d, ...patch } : d)),
    );
  };

  // There is no replace endpoint: a gallery row's source is fixed at insert
  // (the DB enforces image XOR video), so a swap is add + remove, then a
  // reorder that drops the new entry into the old one's slot.
  const replaceSaved = async (
    productId: string,
    mediaId: string,
    create: () => Promise<ProductMedia>,
  ) => {
    const at = order.findIndex((m) => m.id === mediaId);
    const created = await create();
    await remove.mutateAsync({ id: productId, mediaId });
    const next = order.filter((m) => m.id !== mediaId);
    next.splice(at < 0 ? next.length : at, 0, created);
    setOrder(next);
    await reorder.mutateAsync({
      id: productId,
      ids: next.map((m) => m.id),
    });
  };

  const replaceImage = (item: GalleryCardItem, file: File) => {
    if (isDraft) {
      patchDraftItem(item.id, { url: URL.createObjectURL(file), file });
      return;
    }
    replaceSaved(productId, item.id, () =>
      addImage.mutateAsync({
        id: productId,
        file,
        caption: item.caption ?? undefined,
      }),
    ).catch(fail);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = view.findIndex((m) => m.id === active.id);
    const to = view.findIndex((m) => m.id === over.id);
    if (from < 0 || to < 0) return;

    if (isDraft) {
      onDraftChange?.(arrayMove(draft, from, to));
      return;
    }

    const next = arrayMove(order, from, to);
    const previous = order;
    setOrder(next);
    reorder.mutate(
      { id: productId, ids: next.map((m) => m.id) },
      {
        onError: (err) => {
          // Put it back, or the UI would claim an order the server lacks.
          setOrder(previous);
          fail(err);
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      {view.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={view.map((m) => m.id)}
            strategy={rectSortingStrategy}
          >
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              data-testid="gallery-grid"
            >
              {view.map((m) => (
                <li key={m.id}>
                  <Card
                    item={m}
                    disabled={disabled}
                    onCaption={(caption) =>
                      isDraft
                        ? patchDraftItem(m.id, { caption })
                        : setCaption.mutate(
                            { id: productId, mediaId: m.id, caption },
                            { onError: fail },
                          )
                    }
                    onRemove={() =>
                      isDraft
                        ? dropDraft(m.id)
                        : remove.mutate(
                            { id: productId, mediaId: m.id },
                            { onError: fail },
                          )
                    }
                    onReplaceImage={(file) => replaceImage(m, file)}
                    onEditVideo={() => {
                      setVideoUrl(m.video_url ?? "");
                      setVideoCaption(m.caption ?? "");
                      setVideoEdit({ id: m.id });
                    }}
                    onPreview={setPreview}
                  />
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = ""; // allow re-picking the same file
              if (files.length === 0) return;
              if (isDraft) {
                // One call, not one per file: each would read the same stale
                // `draft` and only the last pick would survive.
                onDraftChange?.([
                  ...draft,
                  ...files.map((file) => ({
                    id: `draft-${crypto.randomUUID()}`,
                    kind: "image" as const,
                    url: URL.createObjectURL(file),
                    video_url: null,
                    caption: "",
                    file,
                  })),
                ]);
                return;
              }
              // Sequentially: the server assigns sort_order by arrival, so
              // parallel uploads would land in whatever order they finished
              // rather than the order they were picked in.
              for (const file of files) {
                try {
                  await addImage.mutateAsync({ id: productId, file });
                } catch (err) {
                  fail(err);
                  return;
                }
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={addImage.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {t("products.gallery.add_image")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setVideoUrl("");
              setVideoCaption("");
              setVideoEdit({ id: null });
            }}
          >
            <Video className="size-4" />
            {t("products.gallery.add_video")}
          </Button>
        </div>
      )}

      <Dialog
        open={!!videoEdit}
        onOpenChange={(open) => !open && setVideoEdit(null)}
      >
        <DialogContent>
          <ModalHeader
            icon={Video}
            title={
              videoEdit?.id
                ? t("products.gallery.replace_video")
                : t("products.gallery.add_video")
            }
            subject={t("products.editor.gallery")}
          />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gallery-video-url">
                {t("products.gallery.video_url")}
              </Label>
              <Input
                id="gallery-video-url"
                value={videoUrl}
                placeholder="https://youtu.be/..."
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("products.gallery.video_hosts")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gallery-video-caption">
                {t("products.gallery.caption")}
              </Label>
              <Input
                id="gallery-video-caption"
                value={videoCaption}
                maxLength={300}
                onChange={(e) => setVideoCaption(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVideoEdit(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!videoUrl.trim() || addVideo.isPending}
              onClick={() => {
                const editing = videoEdit?.id ?? null;
                const url = videoUrl.trim();
                const caption = videoCaption.trim();
                const done = () => {
                  setVideoEdit(null);
                  setVideoUrl("");
                  setVideoCaption("");
                };
                if (isDraft) {
                  if (editing) {
                    patchDraftItem(editing, { video_url: url, caption });
                  } else {
                    appendDraft({
                      kind: "video",
                      url: null,
                      video_url: url,
                      caption,
                    });
                  }
                  done();
                  return;
                }
                if (editing) {
                  replaceSaved(productId, editing, () =>
                    addVideo.mutateAsync({
                      id: productId,
                      videoUrl: url,
                      caption: caption || undefined,
                    }),
                  )
                    .then(done)
                    .catch(fail);
                  return;
                }
                addVideo.mutate(
                  {
                    id: productId,
                    videoUrl: url,
                    caption: caption || undefined,
                  },
                  { onSuccess: done, onError: fail },
                );
              }}
            >
              {videoEdit?.id ? t("common.save") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-w-2xl">
          <ModalHeader
            icon={Play}
            title={t("products.gallery.preview")}
            subject={t("products.editor.gallery")}
          />
          {preview && (
            <iframe
              src={preview}
              title={t("products.gallery.preview")}
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="aspect-video w-full rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
