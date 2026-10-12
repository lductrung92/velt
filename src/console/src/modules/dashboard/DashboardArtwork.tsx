import { lazy, Suspense, useSyncExternalStore } from "react";

import { WorkspaceArtwork } from "./WorkspaceArtwork";

const DashboardMotion = lazy(() => import("./DashboardMotion"));
const motionQuery =
  "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia?.(motionQuery);
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}
function motionSnapshot() {
  return window.matchMedia?.(motionQuery).matches ?? false;
}
const staticSnapshot = () => false;

export function DashboardArtwork() {
  const animated = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    staticSnapshot,
  );
  return (
    <div className="dashboard-workspace-art" aria-hidden="true" inert>
      {animated ? (
        <Suspense fallback={<WorkspaceArtwork />}>
          <DashboardMotion />
        </Suspense>
      ) : (
        <WorkspaceArtwork />
      )}
    </div>
  );
}
