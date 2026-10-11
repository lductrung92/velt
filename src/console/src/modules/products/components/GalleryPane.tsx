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
import { GripVertical, ImagePlus, Trash2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/utils/apiError";

import {
  useAddGalleryImage,
  useAddGalleryVideo,
  useRemoveGalleryItem,
  useReorderGallery,
  useUpdateGalleryCaption,
} from "../hooks/useProducts";
import type { ProductMedia } from "../services/products.service";

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
}: {
  item: GalleryCardItem;
  disabled?: boolean;
  onCaption: (caption: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });
  const [caption, setCaption] = useState(item.caption ?? "");
  useEffect(() => setCaption(item.caption ?? ""), [item.caption]);

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
          <img src={item.url} alt="" className="size-full object-cover" />
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
      </div>
      <div className="flex items-center gap-1">
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
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("common.remove")}
            onClick={onRemove}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>
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
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoCaption, setVideoCaption] = useState("");

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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fail = (err: unknown) => toast.error(parseApiError(err, t).message);

  const patchDraft = (mediaId: string, caption: string) =>
    onDraftChange?.(
      draft.map((d) => (d.id === mediaId ? { ...d, caption } : d)),
    );

  const dropDraft = (mediaId: string) => {
    const gone = draft.find((d) => d.id === mediaId);
    // The preview holds a blob alive until it is revoked.
    if (gone?.url) URL.revokeObjectURL(gone.url);
    onDraftChange?.(draft.filter((d) => d.id !== mediaId));
  };

  const appendDraft = (item: Omit<GalleryDraftItem, "id">) =>
    onDraftChange?.([...draft, { ...item, id: `draft-${crypto.randomUUID()}` }]);

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
          <SortableContext items={view.map((m) => m.id)} strategy={rectSortingStrategy}>
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
                        ? patchDraft(m.id, caption)
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
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (isDraft) {
                appendDraft({
                  kind: "image",
                  url: URL.createObjectURL(file),
                  video_url: null,
                  caption: "",
                  file,
                });
              } else {
                addImage.mutate({ id: productId, file }, { onError: fail });
              }
              e.target.value = ""; // allow re-picking the same file
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
            onClick={() => setVideoOpen(true)}
          >
            <Video className="size-4" />
            {t("products.gallery.add_video")}
          </Button>
        </div>
      )}

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.gallery.add_video")}</DialogTitle>
          </DialogHeader>
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
            <Button type="button" variant="outline" onClick={() => setVideoOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!videoUrl.trim() || addVideo.isPending}
              onClick={() => {
                const done = () => {
                  setVideoOpen(false);
                  setVideoUrl("");
                  setVideoCaption("");
                };
                if (isDraft) {
                  appendDraft({
                    kind: "video",
                    url: null,
                    video_url: videoUrl.trim(),
                    caption: videoCaption.trim(),
                  });
                  done();
                  return;
                }
                addVideo.mutate(
                  {
                    id: productId,
                    videoUrl: videoUrl.trim(),
                    caption: videoCaption.trim() || undefined,
                  },
                  { onSuccess: done, onError: fail },
                );
              }}
            >
              {t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
