import { useEffect } from "react";

// Warns before the browser unloads (refresh / tab close / external navigation)
// while there are unsaved edits, so long-form content isn't silently lost. The
// native prompt has fixed wording (browsers ignore custom text). No-op when
// `dirty` is false. In-app route changes are not covered here (React Router) —
// pass the form's dirty flag and rely on the editor's explicit Save/Cancel.
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
