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
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImageIcon,
  ImagePlus,
  Maximize2,
  Pencil,
  Play,
  Star,
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

import { DEVICE_ICON, DeviceFrame } from "./DeviceFrame";
import {
  useAddGalleryImage,
  useAddGalleryVideo,
  useRemoveGalleryItem,
  useReorderGallery,
  useUpdateGalleryItem,
} from "../hooks/useProducts";
import {
  MEDIA_DEVICES,
  type MediaDevice,
  type ProductMedia,
} from "../services/products.service";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/**
 * The tabs. Three devices plus the pile nobody has sorted yet.
 *
 * "unassigned" is not a device and never reaches the API: it is where entries
 * from before the device column live, and where anything uploaded without
 * choosing a tab lands. It disappears from the bar once it is empty, which is
 * the point — it exists to be emptied.
 */
type Tab = MediaDevice | "unassigned";

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
  "id" | "kind" | "url" | "video_url" | "caption" | "device" | "is_hero"
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
  onDevice,
  onHero,
  onExpand,
  onRemove,
  onReplaceImage,
  onEditVideo,
  onPreview,
}: {
  item: GalleryCardItem;
  disabled?: boolean;
  onCaption: (caption: string) => void;
  onDevice: (device: MediaDevice | null) => void;
  onHero: (isHero: boolean) => void;
  onExpand: () => void;
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
      {/* Keep thumbnail actions in their own layer, below the sticky form bar. */}
      <div
        className={cn(
          "kd-gallery-thumb relative isolate flex items-center justify-center overflow-hidden rounded-md bg-muted",
          item.kind === "image" && item.url && "cursor-zoom-in",
        )}
        // The picture itself opens the viewer. The button stays for keyboard
        // and for screen readers, which cannot click a div.
        //
        // The controls sit ON the picture, so their clicks bubble to here:
        // without this guard, emptying the bin or picking a replacement also
        // threw the viewer open on top of what you were doing. Asking the
        // event where it came from covers every control, including ones added
        // later — four stopPropagation calls would not.
        onClick={(e) => {
          if (item.kind !== "image" || !item.url) return;
          if ((e.target as HTMLElement).closest("button, input, a, label")) {
            return;
          }
          onExpand();
        }}
      >
        {item.kind === "image" && item.url ? (
          <DeviceFrame
            src={fileUrl(item.url)}
            alt=""
            device={item.device}
            className="py-1.5"
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
        {/* Looking is not an edit, so both stay available read-only. */}
        {item.kind === "image" && item.url && (
          <button
            type="button"
            aria-label={t("products.gallery.expand")}
            title={t("products.gallery.expand")}
            className={cn(ACTION_BTN, "bottom-1 left-1")}
            onClick={onExpand}
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
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
      {/* The file picker lives outside the picture on purpose. The replace
          button opens it with input.click(), and that click bubbles from the
          input — which is not a button, so the guard above would wave it
          through and the viewer would open behind the file dialog. */}
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
      {/* Which tab this belongs to. Pressing the device it already has takes
          it back to "chưa gán", the same toggle-off the image alignment
          buttons use — so there is a way out without a fourth button. */}
      <div className="flex gap-1" role="group" aria-label={t("products.gallery.device")}>
        {MEDIA_DEVICES.map((device) => {
          const Icon = DEVICE_ICON[device];
          const active = item.device === device;
          return (
            <button
              key={device}
              type="button"
              disabled={disabled}
              aria-label={t(`products.gallery.device_${device}`)}
              title={t(`products.gallery.device_${device}`)}
              aria-pressed={active}
              className={cn(
                // Fixed width, not flex-1: stretched across a wide desktop
                // card the three of them read as empty bars rather than
                // buttons.
                "flex h-7 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
              onClick={() => onDevice(active ? null : device)}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
        {/* The hero checkbox. One per device: the product page shows one
            frame per device at the top, and this says which capture goes in
            it. Sits with the device row because it only means anything
            together with a device. */}
        <label
          className={cn(
            "ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
            item.is_hero
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            disabled && "pointer-events-none opacity-50",
          )}
          title={t("products.gallery.hero_hint")}
        >
          <input
            type="checkbox"
            className="size-3.5 accent-current"
            checked={item.is_hero}
            disabled={disabled}
            onChange={(e) => onHero(e.target.checked)}
          />
          <Star className={cn("size-3.5", item.is_hero && "fill-current")} />
          <span className="sr-only">{t("products.gallery.hero")}</span>
        </label>
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
  // Which entry of the CURRENT TAB is open large, by position. Stepping holds
  // to the tab being looked at: a phone walkthrough is a sequence, and
  // wandering into the desktop captures halfway through breaks it.
  const [viewing, setViewing] = useState<number | null>(null);
  const [chosenTab, setChosenTab] = useState<Tab>("phone");

  const addImage = useAddGalleryImage();
  const addVideo = useAddGalleryVideo();
  const update = useUpdateGalleryItem();
  const remove = useRemoveGalleryItem();
  const reorder = useReorderGallery();

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<ProductMedia[]>(items);
  useEffect(() => setOrder(items), [items]);

  // Everything, in display order. In draft mode the editor owns the list.
  const all: GalleryCardItem[] = isDraft ? draft : order;
  // What the grid renders: one tab's worth. Entries keep their place in the
  // product-wide sort_order — the tab is a filter, not a second ordering.
  const countOf = (value: Tab) =>
    all.filter((m) => (m.device ?? "unassigned") === value).length;
  const unassigned = countOf("unassigned");
  // Filing the last unsorted entry removes the tab being looked at, so the
  // view falls back to a device rather than showing an empty pane with no way
  // back. Derived, not stored: the choice is still whatever was clicked.
  const tab: Tab =
    chosenTab === "unassigned" && unassigned === 0 ? "phone" : chosenTab;
  const view = all.filter((m) => (m.device ?? "unassigned") === tab);
  // The device an upload lands on: the tab being looked at, or nothing at all
  // while looking at the unsorted pile.
  const dropInto: MediaDevice | null = tab === "unassigned" ? null : tab;

  // What the viewer shows. Indexing into the filtered list means a deletion,
  // or a switch of tab, can leave the index pointing past the end — then
  // there is nothing to show and the dialog closes itself.
  const shown = viewing === null ? null : (view[viewing] ?? null);
  const step = (delta: number) =>
    setViewing((at) =>
      at === null || view.length === 0
        ? at
        : (at + delta + view.length) % view.length,
    );

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
        device: item.device,
      }),
    ).catch(fail);
  };

  /**
   * Puts a tab's reordered entries back into the product-wide order.
   *
   * Only the slots this tab already occupies are rewritten, so moving two
   * phone screenshots around cannot shuffle the desktop ones — which is what
   * reordering the flat list by the visible indexes would have done.
   */
  const weave = <T extends GalleryCardItem>(full: T[], tabOrder: T[]): T[] => {
    const queue = [...tabOrder];
    return full.map((m) =>
      (m.device ?? "unassigned") === tab ? (queue.shift() as T) : m,
    );
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = view.findIndex((m) => m.id === active.id);
    const to = view.findIndex((m) => m.id === over.id);
    if (from < 0 || to < 0) return;

    if (isDraft) {
      const moved = arrayMove(
        draft.filter((m) => (m.device ?? "unassigned") === tab),
        from,
        to,
      );
      onDraftChange?.(weave(draft, moved));
      return;
    }

    const movedTab = arrayMove(
      order.filter((m) => (m.device ?? "unassigned") === tab),
      from,
      to,
    );
    const next = weave(order, movedTab);
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

  // The unsorted tab is only there while something is unsorted: it exists to
  // be emptied.
  const tabs: Tab[] = unassigned > 0 ? [...MEDIA_DEVICES, "unassigned"] : [...MEDIA_DEVICES];

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label={t("products.gallery.device")}
      >
        {tabs.map((value) => {
          const Icon = value === "unassigned" ? ImageIcon : DEVICE_ICON[value];
          const count = countOf(value);
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setChosenTab(value)}
            >
              <Icon className="size-4" aria-hidden />
              {t(`products.gallery.device_${value}`)}
              <span className="text-xs text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>

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
              // Each tab holds one shape, so the grid is cut for that shape:
              // a column of phone captures is narrow and tall, a row of
              // desktop ones is wide and short. One grid for all three left
              // every picture too small to read without opening it.
              className="kd-gallery-grid"
              data-device={tab}
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
                        : update.mutate(
                            {
                              id: productId,
                              mediaId: m.id,
                              caption,
                              device: m.device,
                            },
                            { onError: fail },
                          )
                    }
                    onHero={(isHero) =>
                      isDraft
                        ? patchDraftItem(m.id, { is_hero: isHero })
                        : update.mutate(
                            {
                              id: productId,
                              mediaId: m.id,
                              caption: m.caption,
                              device: m.device,
                              is_hero: isHero,
                            },
                            { onError: fail },
                          )
                    }
                    onDevice={(device) =>
                      isDraft
                        ? patchDraftItem(m.id, { device })
                        : update.mutate(
                            {
                              id: productId,
                              mediaId: m.id,
                              caption: m.caption,
                              device,
                            },
                            {
                              // Moving it means the tab it was in no longer
                              // holds it; the list refetches and the card
                              // appears under its new tab.
                              onError: fail,
                            },
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
                    onExpand={() => setViewing(view.indexOf(m))}
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

      {view.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {t("products.gallery.empty_tab")}
        </p>
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
                    device: dropInto,
                    is_hero: false,
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
                  await addImage.mutateAsync({
                    id: productId,
                    file,
                    device: dropInto,
                  });
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
                      device: dropInto,
                      is_hero: false,
                    });
                  }
                  done();
                  return;
                }
                if (editing) {
                  const was = order.find((m) => m.id === editing)?.device ?? null;
                  replaceSaved(productId, editing, () =>
                    addVideo.mutateAsync({
                      id: productId,
                      videoUrl: url,
                      caption: caption || undefined,
                      device: was,
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
                    device: dropInto,
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

      <Dialog
        open={shown !== null}
        onOpenChange={(open) => !open && setViewing(null)}
      >
        {/* Wider than a form dialog: the point of opening it is the pixels. */}
        <DialogContent
          className="max-w-[min(96vw,64rem)]"
          closeLabel={t("common.close")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") step(-1);
            if (e.key === "ArrowRight") step(1);
          }}
        >
          <ModalHeader
            icon={Maximize2}
            title={t("products.gallery.expand")}
            subject={
              shown
                ? `${t(`products.gallery.device_${shown.device ?? "unassigned"}`)} · ${(viewing ?? 0) + 1}/${view.length}`
                : t("products.editor.gallery")
            }
          />
          {shown && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("products.gallery.previous")}
                disabled={view.length < 2}
                onClick={() => step(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <div className="flex min-w-0 flex-1 justify-center">
                <DeviceFrame
                  src={shown.url ? fileUrl(shown.url) : null}
                  alt={shown.caption ?? ""}
                  device={shown.device}
                  size="full"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("products.gallery.next")}
                disabled={view.length < 2}
                onClick={() => step(1)}
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
          )}
          {shown?.caption && (
            <p className="text-center text-sm text-muted-foreground">
              {shown.caption}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
