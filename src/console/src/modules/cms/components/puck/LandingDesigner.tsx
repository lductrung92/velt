import {
  ActionBar,
  fieldsPlugin,
  Puck,
  usePuck,
  type Data,
} from "@puckeditor/core";
import "@puckeditor/core/dist/index.css";
import "../../pages/puck-theme.css";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ModalHeader } from "@/components/common/ModalHeader";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAppConfig } from "@/app/useAppConfig";
import { useEntityTranslation } from "@/modules/translation/hooks/useEntityTranslation";
import { translationService } from "@/modules/translation/services/translation.service";

import {
  resolvePendingImages,
  sectionsToPuckData,
  syncSections,
} from "./adapter";
import { buildLandingPuckConfig } from "./puckConfig";
import { cmsKeys } from "../../hooks/cmsKeys";
import {
  collectText,
  ConfigTranslationFields,
} from "../landingSections/translationFields";

import type { LandingDetail } from "../../services/landing.service";

type SectionItem = { type: string; props: { id?: string; cfg?: unknown } };

/**
 * Whether the section editor is open.
 *
 * Two overrides need the same answer and they are rendered in different corners
 * of Puck's tree: the action bar's pencil opens it, and the fields panel IS it.
 */
const EditorOpen = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * The ids of sections that exist on the server.
   *
   * Puck gives every component an id of its own, so a section dragged in this
   * session HAS one — it just is not an address: asking the translation API
   * about it would be asking about a record nobody created. The landing knows
   * which ids are real, so it says.
   */
  savedIds: Set<string>;
  /** Keeps a new section's translation until the save hands out its real id. */
  stash: (
    puckId: string,
    pending: Record<string, Record<string, unknown>>,
  ) => void;
}>({
  open: false,
  setOpen: () => {},
  savedIds: new Set(),
  stash: () => {},
});

/**
 * The builder's own header.
 *
 * Puck's has an undo/redo pair, a publish action and three panel toggles, two
 * of which point at panels this build does not have. Replacing it outright is
 * also how the library toggle ends up with the same icon the console's own
 * sidebar uses — the editor sits inside the app, not beside it.
 */
function BuilderHeader() {
  const { t } = useTranslation();
  const { appState, dispatch } = usePuck();
  const open = appState.ui.leftSideBarVisible;
  return (
    <div className="flex h-12 items-center gap-2 border-b bg-background px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("cms.landings.builder.toggle_library")}
        onClick={() =>
          dispatch({ type: "setUi", ui: { leftSideBarVisible: !open } })
        }
      >
        {open ? (
          <PanelLeftClose className="h-5 w-5" />
        ) : (
          <PanelLeftOpen className="h-5 w-5" />
        )}
      </Button>
      <span className="text-sm font-medium">
        {t("cms.landings.builder.canvas")}
      </span>
    </div>
  );
}

/** The pencil on a selected section's action bar. */
function EditAction() {
  const { t } = useTranslation();
  const { setOpen } = useContext(EditorOpen);
  return (
    <ActionBar.Action
      label={t("cms.landings.builder.edit")}
      onClick={() => setOpen(true)}
    >
      <Pencil size={16} />
    </ActionBar.Action>
  );
}

/**
 * The selected section's settings, as a dialog.
 *
 * `children` is Puck's own field panel — the override hands it over and this
 * renders it inside a dialog instead of in a column of its own. Puck keeps the
 * panel mounted (the column is hidden in CSS, not unmounted), so the fields
 * carry on writing straight through to the editor's store: there is no apply
 * step here, and closing is just closing.
 *
 * The other languages sit beside it when the section has a lot of text, and
 * underneath when it has a little — the same box the Giao diện screen uses.
 */
function SectionEditorDialog({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { open, setOpen, savedIds, stash } = useContext(EditorOpen);
  const { appState, config, dispatch } = usePuck();
  const { data: appConfig } = useAppConfig();

  const selector = appState.ui.itemSelector;
  const content = (appState.data.content ?? []) as unknown as SectionItem[];
  const item = selector ? content[selector.index] : undefined;
  const label = item ? (config.components[item.type]?.label ?? item.type) : "";

  // A section added in this session has no address to store a translation
  // against until the page is saved, which is also when it gets one.
  const puckId = item?.props.id;
  const sectionId = puckId && savedIds.has(puckId) ? puckId : undefined;
  const tr = useEntityTranslation("landing_section", sectionId);
  const others = tr.tabs.filter((locale) => locale !== tr.baseLocale);
  const nodes = useMemo(() => collectText(item?.props.cfg), [item?.props.cfg]);
  const translatable =
    appConfig?.translationEnabled === true &&
    others.length > 0 &&
    nodes.length > 0;
  // Two columns whenever there is a translation to put beside the original:
  // the two are read together, field by field, and stacking them meant
  // scrolling away from the text being translated in order to see it.
  const wide = translatable;
  // ...and a wider box again once the section carries a list — a testimonial
  // set or an audience grid runs to dozens of boxes, and at 896px each column
  // was too narrow to read a sentence in.
  const huge = wide && nodes.length > 8;

  // The source language is the form on the left; this is for the others.
  const { isBase, setLocale } = tr;
  const first = others[0];
  useEffect(() => {
    if (first && isBase) setLocale(first);
  }, [first, isBase, setLocale]);

  // Deselecting while the dialog is open would leave the page's own fields in
  // it, which is not what the pencil was pointed at.
  useEffect(() => {
    if (!selector) setOpen(false);
  }, [selector, setOpen]);

  /*
   * What the section held when the dialog opened.
   *
   * Puck's fields write straight into the editor store as they are typed —
   * that is what makes the canvas behind the dialog update live — so there is
   * nothing to "apply" on Done and, until now, nothing to undo on Cancel
   * either: closing the box left every keystroke in the page. This is the
   * copy that Cancel puts back.
   *
   * Read through a ref rather than from the effect's own closure: the effect
   * must run when the dialog OPENS, not every time a field changes, or it
   * would keep overwriting the snapshot with the edits it is meant to undo.
   */
  const live = useRef<{ index: number; item: SectionItem } | null>(null);
  live.current =
    selector && item ? { index: selector.index, item } : live.current;
  const opened = useRef<{ index: number; item: SectionItem } | null>(null);
  useEffect(() => {
    if (!open) {
      opened.current = null;
      return;
    }
    const now = live.current;
    opened.current = now
      ? { index: now.index, item: structuredClone(now.item) }
      : null;
  }, [open]);

  // Cancel: put the section back and drop the translation draft with it.
  function cancel() {
    const snap = opened.current;
    if (snap) {
      dispatch({
        type: "setData",
        data: (previous) => ({
          content: (previous.content ?? []).map((entry, index) =>
            index === snap.index
              ? (snap.item as unknown as (typeof previous.content)[number])
              : entry,
          ),
        }),
      });
    }
    tr.reset();
    setOpen(false);
  }

  async function done() {
    if (sectionId && tr.dirty) {
      try {
        await tr.flush(sectionId);
      } catch {
        toast.error(t("errors.unknown"));
        return;
      }
    } else if (puckId && Object.keys(tr.pending).length > 0) {
      stash(puckId, tr.pending);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && cancel()}>
      <DialogContent
        closeLabel={t("common.close")}
        /*
         * grid-rows is the whole of the scrolling.
         *
         * The dialog is a grid capped at 90dvh, and a grid row sized `auto`
         * takes its content's height whatever the cap says — a long section
         * measured 2122px in an 810px box, so `overflow-y-auto` on the middle
         * child had nothing to scroll inside and the form simply ran out of
         * the bottom, footer and all. minmax(0,1fr) is what hands that row the
         * space that is left and no more.
         *
         * Width goes up in steps with the form: a translation beside the
         * original needs two columns, and a section with a lot of text needs
         * both of those columns to be wide enough to read.
         */
        className={`grid-rows-[auto_minmax(0,1fr)_auto] max-h-[90dvh] ${
          wide ? (huge ? "sm:max-w-7xl" : "sm:max-w-5xl") : "sm:max-w-3xl"
        }`}
      >
        <ModalHeader
          icon={SlidersHorizontal}
          title={t("cms.landings.builder.edit_title")}
          subject={label}
        />
        <div
          className={`min-h-0 overflow-y-auto pr-1 ${
            wide ? "grid items-start gap-6 sm:grid-cols-2" : "space-y-6"
          }`}
        >
          <div className="kd-puck-fields space-y-4">{children}</div>
          {translatable && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  <Languages className="mr-1 inline size-3.5" aria-hidden />
                  {t("cms.landings.translate.title_short")}
                </Label>
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label={t("tr.tabs")}
                >
                  {others.map((locale) => (
                    <Button
                      key={locale}
                      type="button"
                      size="sm"
                      variant={locale === tr.locale ? "secondary" : "ghost"}
                      aria-pressed={locale === tr.locale}
                      onClick={() => tr.setLocale(locale)}
                    >
                      {locale.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
              <ConfigTranslationFields
                nodes={nodes}
                draft={tr.values.config}
                onChange={(next) => tr.setField("config", next)}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  sectionId
                    ? "cms.landings.translate.hint"
                    : "cms.landings.translate.hint_new",
                )}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel}>
            <X className="size-4" />
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => void done()}>
            <Check className="size-4" />
            {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const plugins = useMemo(() => [fieldsPlugin({ desktopSideBar: "left" })], []);
  const [open, setOpen] = useState(false);
  // Translations typed for a section that did not exist yet, by the id Puck
  // gave it. The save below turns those into real addresses.
  const pendingTr = useRef<
    Record<string, Record<string, Record<string, unknown>>>
  >({});
  const savedIds = useMemo(
    () => new Set(current.sections.map((section) => section.id)),
    [current],
  );
  const editor = useMemo(
    () => ({
      open,
      setOpen,
      savedIds,
      stash: (
        puckId: string,
        pending: Record<string, Record<string, unknown>>,
      ) => {
        pendingTr.current[puckId] = pending;
      },
    }),
    [open, savedIds],
  );

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
        // Only now does a section added in this session have an address. The
        // reconcile writes sections in Puck's order, so the nth of each is the
        // same section — the one moment the two lists can be paired.
        const items = (resolved.content ?? []) as unknown as SectionItem[];
        for (let i = 0; i < items.length; i++) {
          const typed = pendingTr.current[items[i].props.id ?? ""];
          const section = refreshed.sections[i];
          if (!typed || !section) continue;
          for (const [locale, values] of Object.entries(typed)) {
            await translationService.put(
              "landing_section",
              section.id,
              locale,
              values,
            );
          }
        }
        pendingTr.current = {};
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

  // The whole header is ours: Puck's carries a Publish action the page editor
  // already owns, an undo/redo pair, and toggles for panels that are not there.
  //
  // `fields` moves the right-hand panel into a dialog, and `actionBar` is what
  // opens it: a section is edited from the section, not from a column that is
  // in the way the rest of the time.
  const overrides = useMemo(
    () => ({
      header: () => <BuilderHeader />,
      fields: ({ children }: { children: ReactNode }) => (
        <SectionEditorDialog>{children}</SectionEditorDialog>
      ),
      actionBar: ({
        label,
        children,
        parentAction,
      }: {
        label?: string;
        children?: ReactNode;
        parentAction?: ReactNode;
      }) => (
        <ActionBar label={label}>
          <ActionBar.Group>{parentAction}</ActionBar.Group>
          <ActionBar.Group>
            <EditAction />
            {children}
          </ActionBar.Group>
        </ActionBar>
      ),
    }),
    [],
  );

  // Fixed-height editing area; puck-theme.css makes Puck fill it (height:100%
  // instead of Puck's 100dvh) so its palette/canvas/field panes scroll inside.
  return (
    <EditorOpen.Provider value={editor}>
      <div className="kd-puck h-[38rem] overflow-hidden rounded-lg border">
        <Puck
          key={seed}
          config={config}
          data={data}
          iframe={{ enabled: false }}
          // Declaring the fields plugin ourselves stops Puck adding its own: the
          // default one renders the field panel TWICE (the right column and a
          // mobile tab), and two copies of a dialog hide each other from the
          // accessibility tree. As a left-hand plugin there is exactly one, and
          // the strip that would switch to it is gone — the dialog is the panel.
          plugins={plugins}
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
    </EditorOpen.Provider>
  );
});
