import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TeamGlobeArtwork, type GlobeProps } from "./TeamGlobeArtwork";

const Motion = lazy(() => import("./TeamGlobeMotion"));
const query = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;
export function TeamGlobe(props: GlobeProps) {
  const allowed = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const animated = allowed && visible;
  return (
    <div
      className="team-globe"
      ref={ref}
      data-globe-motion={animated ? "animated" : "static"}
    >
      <div className="team-globe-canvas">
        {animated ? (
          <Suspense fallback={<TeamGlobeArtwork {...props} />}>
            <Motion {...props} />
          </Suspense>
        ) : (
          <TeamGlobeArtwork {...props} />
        )}
      </div>
    </div>
  );
}
