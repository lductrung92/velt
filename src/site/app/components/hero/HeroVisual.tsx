import { lazy, Suspense, useSyncExternalStore } from "react";
import { useSite } from "../../context";
import { HeroArtwork } from "./HeroArtwork";

const HeroMotion = lazy(() => import("./HeroMotion"));
const query = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function snapshot() {
  return window.matchMedia(query).matches;
}
const serverSnapshot = () => false;

export function HeroVisual() {
  const { t } = useSite();
  const animated = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <div
      className="hero-visual hero-motion-visual"
      role="img"
      aria-label={t("hero.art.visual_label")}
      data-hero-motion={animated ? "animated" : "static"}
    >
      <div className="hero-motion-canvas" aria-hidden="true" inert>
        {animated ? (
          <Suspense fallback={<HeroArtwork />}>
            <HeroMotion />
          </Suspense>
        ) : (
          <HeroArtwork />
        )}
      </div>
      <span className="hero-motion-caption">{t("hero.art.caption")}</span>
    </div>
  );
}
