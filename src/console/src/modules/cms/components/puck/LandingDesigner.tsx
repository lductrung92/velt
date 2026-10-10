import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Puck, usePuck, type Data } from "@puckeditor/core";
import "@puckeditor/core/dist/index.css";
import "../../pages/puck-theme.css";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  resolvePendingImages,
  sectionsToPuckData,
  syncSections,
} from "./adapter";
import { buildLandingPuckConfig } from "./puckConfig";
import { cmsKeys } from "../../hooks/cmsKeys";
import type { LandingDetail } from "../../services/landing.service";

// Puck's root content lives in the "root:default-zone" droppable.
const ROOT_ZONE = "root:default-zone";

type OutlineItem = { type: string; props: { id?: string } };

// OutlineRow — one draggable section in the Outline (dnd-kit sortable, matching
// the CMS menu builder). Grip handle drags; the label click selects.
function OutlineRow({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="landing-outline-item"
      className={`flex items-center gap-1 rounded-lg border px-2 py-2 text-sm ${
        selected ? "border-primary bg-primary/5" : "bg-card"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={t("cms.landings.builder.reorder")}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        onClick={onSelect}
      >
        {label}
      </button>
    </div>
  );
}

// OutlineNav replaces Puck's default Outline (no reorder + tight spacing) with a
// Blocks-styled, drag-sortable list (dnd-kit, like the menu builder). Click
// selects a section; dragging the grip reorders via Puck's reorder action.
function OutlineNav() {
  const { t } = useTranslation();
  const { appState, dispatch, config } = usePuck();
  const content = (appState.data.content ?? []) as unknown as OutlineItem[];
  const selected = appState.ui.itemSelector?.index;
  const ids = content.map((it, i) => it.props.id ?? String(i));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (content.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        {t("cms.landings.builder.no_sections")}
      </div>
    );
  }

  const select = (index: number) =>
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    dispatch({
      type: "reorder",
      sourceIndex: from,
      destinationIndex: to,
      destinationZone: ROOT_ZONE,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3" data-testid="landing-outline">
          {content.map((item, i) => (
            <OutlineRow
              key={ids[i]}
              id={ids[i]}
              label={config.components[item.type]?.label ?? item.type}
              selected={selected === i}
              onSelect={() => select(i)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export interface LandingDesignerHandle {
  // Persist the current design: upload deferred images, then reconcile Puck's
  // end-state to the section CRUD API. Throws on API error (caller toasts).
  save: () => Promise<void>;
}

// LandingDesigner embeds the visual (Puck) landing builder inside the page
// editor. It owns the Puck editor + its live data, but NOT a Save button — the
// page editor's single Save calls save() (via ref) alongside the page-field
// update, so one click persists both the page metadata and the design.
export const LandingDesigner = forwardRef<
  LandingDesignerHandle,
  { detail: LandingDetail; onDirty?: () => void }
>(function LandingDesigner({ detail, onDirty }, ref) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [current, setCurrent] = useState<LandingDetail>(detail);
  // Puck's `data` prop is init-only — it never re-syncs a changed prop into its
  // internal store. So after a save we bump `seed` to REMOUNT Puck, re-seeding it
  // from the freshly-reconciled sections (real backend ids, no pending image
  // markers). Without this, a second save in the same session would re-upload
  // every image and churn section ids (create+delete each save).
  const [seed, setSeed] = useState(0);
  // Live Puck data (updated on every edit) — the payload save() reconciles.
  const dataRef = useRef<Data>(sectionsToPuckData(detail.sections));
  // JSON of the last-seeded data; onChange compares against it to flag design
  // dirtiness for the page editor's unsaved-changes guard.
  const seededJSON = useRef(JSON.stringify(dataRef.current));
  const dirtyRef = useRef(false);

  const config = useMemo(
    () => buildLandingPuckConfig(t, detail.id),
    [t, detail.id],
  );
  // Re-seed initial data whenever the reconciled sections change (after a save).
  const data = useMemo(() => sectionsToPuckData(current.sections), [current]);

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        const resolved = await resolvePendingImages(detail.id, dataRef.current);
        const refreshed = await syncSections(current, resolved);
        const nextData = sectionsToPuckData(refreshed.sections);
        dataRef.current = nextData;
        seededJSON.current = JSON.stringify(nextData);
        dirtyRef.current = false;
        // Keep the React Query cache in sync so reopening the editor within
        // staleTime doesn't re-seed from the pre-save detail (which would
        // resurrect deleted sections).
        qc.setQueryData(cmsKeys.landingDetail(detail.id), refreshed);
        setCurrent(refreshed);
        setSeed((s) => s + 1); // remount Puck with the reconciled data
      },
    }),
    [current, detail.id, qc],
  );

  // Swap Puck's default Outline for our reorderable, Blocks-styled section list.
  // The header "Publish" action is dropped entirely (headerActions renders
  // nothing); the page editor owns the single Save button. Puck types the
  // override as returning an element, so render an empty fragment, not null.
  const overrides = useMemo(
    () => ({
      headerActions: () => <></>,
      outline: () => <OutlineNav />,
    }),
    [],
  );

  // Fixed-height editing area; puck-theme.css makes Puck fill it (height:100%
  // instead of Puck's 100dvh) so its palette/canvas/field panes scroll inside.
  return (
    <div className="kd-puck h-[38rem] overflow-hidden rounded-lg border">
      <Puck
        key={seed}
        config={config}
        data={data}
        iframe={{ enabled: false }}
        overrides={overrides}
        onChange={(d) => {
          dataRef.current = d;
          // Flag dirty only on a real change (Puck may fire onChange on mount
          // with the seed data — that must NOT count). Compare once until dirty.
          if (!dirtyRef.current && JSON.stringify(d) !== seededJSON.current) {
            dirtyRef.current = true;
            onDirty?.();
          }
        }}
      />
    </div>
  );
});
