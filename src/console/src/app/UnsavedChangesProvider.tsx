import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router-dom";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";

/**
 * One guard for every "you have unsaved work" prompt in the console.
 *
 * WHY A PROVIDER, and not a hook each editor calls for itself: React Router
 * allows exactly ONE blocker per router. A second `useBlocker` anywhere in the
 * tree logs "A router only supports one blocker at a time" and the two fight
 * over the same navigation. The documented answer is to lift the blocker to a
 * common parent and combine the conditions — which is all this file is.
 *
 * It owns two mechanisms, because neither covers the other's ground:
 *   • useBlocker    — in-app navigation: links, the back button, navigate().
 *                     Cannot see a document unload.
 *   • beforeunload  — reload, tab close, leaving for another origin.
 *                     Shows the browser's own wording; ours is ignored.
 *
 * Deliberately NOT covered: typing a URL straight into the address bar. The
 * browser changes location before any script runs; React Router records this
 * as a known limit of the History API rather than a bug.
 *
 * See docs/styles/console/unsaved-changes.md for the full design.
 */

/** What one screen (or one open dialog) has pending. */
type Source = {
  dirty: boolean;
  /** Noun for the prompt, e.g. "bài viết". Falls back to generic wording. */
  what?: string;
};

type Registry = {
  register: (id: symbol, source: Source) => void;
  unregister: (id: symbol) => void;
};

const RegistryContext = React.createContext<Registry | null>(null);

/**
 * Declares that this screen has unsaved work. Safe to call unconditionally —
 * pass `when: false` while the form is pristine.
 *
 * A screen may compose several signals, which is what the editors already do:
 *   useUnsavedChanges({ when: form.formState.isDirty || coverDirty || tr.dirty })
 */
export function useUnsavedChanges({
  when,
  what,
}: {
  when: boolean;
  what?: string;
}): void {
  const registry = React.useContext(RegistryContext);
  // A symbol per calling component, so two editors — or a screen and the
  // dialog open on top of it — never collide on one key.
  const idRef = React.useRef<symbol | null>(null);
  idRef.current ??= Symbol("unsaved-changes");

  React.useEffect(() => {
    if (!registry) return;
    const id = idRef.current as symbol;
    registry.register(id, { dirty: when, what });
    return () => registry.unregister(id);
  }, [registry, when, what]);
}

export function UnsavedChangesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [sources, setSources] = React.useState<ReadonlyMap<symbol, Source>>(
    () => new Map(),
  );

  const registry = React.useMemo<Registry>(
    () => ({
      register: (id, source) =>
        setSources((prev) => {
          const prevSource = prev.get(id);
          if (
            prevSource &&
            prevSource.dirty === source.dirty &&
            prevSource.what === source.what
          ) {
            return prev; // nothing moved; don't re-render the whole shell
          }
          return new Map(prev).set(id, source);
        }),
      unregister: (id) =>
        setSources((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }),
    }),
    [],
  );

  const pending = React.useMemo(
    () => [...sources.values()].filter((s) => s.dirty),
    [sources],
  );
  const dirty = pending.length > 0;
  // With two sources pending the prompt stays generic rather than naming one
  // of them and implying the other is safe.
  const what = pending.length === 1 ? pending[0].what : undefined;

  const blocker = useBlocker(
    React.useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  );

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Assigning returnValue is what older browsers still key off. The string
      // itself is ignored everywhere — custom wording was dropped in Chrome 51.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const blocked = blocker.state === "blocked";

  return (
    <RegistryContext.Provider value={registry}>
      {children}
      <ConfirmDialog
        open={blocked}
        // Escape, the overlay and Cancel all land here: staying put is the
        // safe answer, so every one of them resets rather than proceeds.
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title={t("common.unsaved.title")}
        description={
          what
            ? t("common.unsaved.hint_named", { what })
            : t("common.unsaved.hint")
        }
        confirmLabel={t("common.unsaved.confirm")}
        confirmIcon={ArrowLeft}
        onConfirm={() => blocker.proceed?.()}
      />
    </RegistryContext.Provider>
  );
}
