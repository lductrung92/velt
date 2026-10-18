import { useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { interpolate, useCurrentFrame } from "remotion";
import type { ProductMedia } from "../../types";
import { safeUrl } from "../../lib/links";
import { Img } from "../Img";

const FPS = 30;
const SLIDE_FRAMES = FPS * 6;
const TRANSITION_FRAMES = 24;

export interface GalleryMotionProps {
  images: ProductMedia[];
  playing: boolean;
  seek: { index: number; revision: number };
  onIndex: (index: number) => void;
}

/** Animate captures only: hardware and screen proportions never jump. */
function Screens({ images }: { images: ProductMedia[] }) {
  const frame = useCurrentFrame();
  const index = Math.floor(frame / SLIDE_FRAMES) % images.length;
  const next = (index + 1) % images.length;
  const progress = interpolate(
    frame % SLIDE_FRAMES,
    [SLIDE_FRAMES - TRANSITION_FRAMES, SLIDE_FRAMES - 1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div className="pd-motion-canvas">
      {images.map((image, i) => (
        <div
          key={`${image.url}-${i}`}
          className="pd-motion-slide"
          style={{
            opacity: i === index ? 1 : i === next ? progress : 0,
            zIndex: i === next ? 2 : i === index ? 1 : 0,
            transform:
              i === next ? `translateX(${12 * (1 - progress)}px)` : "none",
          }}
        >
          <Img
            src={safeUrl(image.url)}
            width={image.width}
            height={image.height}
            alt=""
            sizes="100vw"
            original
          />
        </div>
      ))}
    </div>
  );
}

export default function ProductGalleryMotion({
  images,
  playing,
  seek,
  onIndex,
}: GalleryMotionProps) {
  const player = useRef<PlayerRef>(null);
  const lastIndex = useRef(-1);
  const inputProps = useMemo(() => ({ images }), [images]);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const update = ({ detail }: { detail: { frame: number } }) => {
      const index = Math.floor(detail.frame / SLIDE_FRAMES) % images.length;
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        onIndex(index);
      }
    };
    instance.addEventListener("frameupdate", update);
    return () => instance.removeEventListener("frameupdate", update);
  }, [images.length, onIndex]);
  useEffect(() => {
    player.current?.seekTo(seek.index * SLIDE_FRAMES);
  }, [seek]);
  useEffect(() => {
    if (playing) player.current?.play();
    else player.current?.pause();
  }, [playing]);
  const first = images[0];
  return (
    <Player
      ref={player}
      component={Screens}
      inputProps={inputProps}
      durationInFrames={images.length * SLIDE_FRAMES}
      compositionWidth={first.width || 1600}
      compositionHeight={first.height || 1000}
      fps={FPS}
      loop
      initiallyMuted
      numberOfSharedAudioTags={0}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      errorFallback={() => (
        <Img
          src={safeUrl(first.url)}
          width={first.width}
          height={first.height}
          alt=""
          sizes="100vw"
          original
        />
      )}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
