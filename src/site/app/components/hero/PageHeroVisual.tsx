import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PageHeroArtwork, type PageHeroKind } from "./PageHeroArtwork";

const Motion = lazy(() => import("./PageHeroMotion"));
const query = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

export function PageHeroVisual({ kind }: { kind: PageHeroKind }) {
  const eligible = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!eligible || !container.current) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [eligible]);
  const animated = eligible && visible;
  return (
    <div
      ref={container}
      className="page-hero-visual"
      aria-hidden="true"
      inert
      data-page-hero={kind}
      data-motion={animated ? "animated" : "static"}
    >
      {animated ? (
        <Suspense fallback={<PageHeroArtwork kind={kind} />}>
          <Motion kind={kind} />
        </Suspense>
      ) : (
        <PageHeroArtwork kind={kind} />
      )}
    </div>
  );
}
