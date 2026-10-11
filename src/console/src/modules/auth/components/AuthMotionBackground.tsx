import { Player, type PlayerRef } from "@remotion/player";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";

import { WorkdayScene } from "./WorkdayScene";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia?.(reducedMotionQuery);
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}
function motionSnapshot() {
  return window.matchMedia?.(reducedMotionQuery).matches ?? true;
}
const staticSnapshot = () => true;
const emptyFallback = () => null;

export default function AuthMotionBackground() {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const [size, setSize] = useState({ width: 1440, height: 900 });
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    staticSnapshot,
  );
  const labels = useMemo(
    () => ({
      plan: t("auth.layout.motion.plan"),
      idea: t("auth.layout.motion.idea"),
      build: t("auth.layout.motion.build"),
      launch: t("auth.layout.motion.launch"),
    }),
    [t],
  );

  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) player.current?.pause();
    else player.current?.play();
  }, [reducedMotion]);

  return (
    <div className="auth-motion" ref={container} aria-hidden="true" inert>
      <Player
        ref={player}
        component={WorkdayScene}
        inputProps={{ labels }}
        durationInFrames={720}
        fps={30}
        compositionWidth={size.width}
        compositionHeight={size.height}
        initialFrame={90}
        autoPlay={!reducedMotion}
        initiallyMuted
        numberOfSharedAudioTags={0}
        loop
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        errorFallback={emptyFallback}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
