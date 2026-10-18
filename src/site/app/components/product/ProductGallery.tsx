import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { DeviceKind, ProductMedia } from "../../types";
import { useSite } from "../../context";
import { safeUrl } from "../../lib/links";
import { Icon } from "../Icon";
import { Img } from "../Img";
import { DEVICES, DeviceFrame, DeviceIcon, imageDevice } from "./DeviceFrame";
import type { GalleryMotionProps } from "./ProductGalleryMotion";

function Still({ image }: { image: ProductMedia }) {
  return (
    <Img
      src={safeUrl(image.url)}
      width={image.width}
      height={image.height}
      alt=""
      sizes="100vw"
      original
    />
  );
}
const Motion = lazy(() =>
  import("./ProductGalleryMotion").catch(() => ({
    default: ({ images, seek }: GalleryMotionProps) => (
      <Still image={images[seek.index] || images[0]} />
    ),
  })),
);
const motionQuery = "(prefers-reduced-motion: no-preference)";
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const motionSnapshot = () => window.matchMedia(motionQuery).matches;
const serverSnapshot = () => false;

/** Each device owns a separate walkthrough; the player animates only its screen. */
export function ProductGallery({
  images,
  name,
}: {
  images: ProductMedia[];
  name: string;
}) {
  const { t } = useSite();
  const byDevice = useMemo(() => {
    const groups = new Map<DeviceKind, ProductMedia[]>();
    for (const device of DEVICES) {
      const own = images.filter((image) => imageDevice(image) === device);
      if (own.length) groups.set(device, own);
    }
    return groups;
  }, [images]);
  const available = DEVICES.filter((device) => byDevice.has(device));
  const preferred = byDevice.has("desktop")
    ? "desktop"
    : available[0] || "desktop";
  const [device, setDevice] = useState<DeviceKind>(preferred);
  const activeDevice = byDevice.has(device) ? device : preferred;
  const shown = byDevice.get(activeDevice) ?? [];
  const [index, setIndex] = useState(0);
  const [seek, setSeek] = useState({ index: 0, revision: 0 });
  const at = shown.length ? index % shown.length : 0;
  const current = shown[at];
  const stage = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [focused, setFocused] = useState(false);
  const allowMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    serverSnapshot,
  );

  useEffect(() => {
    if (!stage.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setEntered(true);
      },
      { threshold: 0.1 },
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const change = () => setPageVisible(document.visibilityState !== "hidden");
    change();
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  const chooseDevice = (next: DeviceKind) => {
    setDevice(next);
    setIndex(0);
    setSeek((previous) => ({ index: 0, revision: previous.revision + 1 }));
  };
  const jump = (target: number) => {
    if (!shown.length) return;
    const next = (target + shown.length) % shown.length;
    setIndex(next);
    setSeek((previous) => ({ index: next, revision: previous.revision + 1 }));
  };
  if (!current) return null;
  const animated = allowMotion && entered && shown.length > 1;
  const playing = animated && visible && pageVisible && !focused;
  return (
    <section
      className="pd-gallery pd-section"
      id="product-gallery"
      aria-labelledby="pd-gallery-title"
    >
      <header className="pd-section-heading">
        <div>
          <span className="pd-kicker">{t("product.gallery_eyebrow")}</span>
          <h2 id="pd-gallery-title">{t("product.gallery_title")}</h2>
        </div>
        {available.length > 1 && (
          <div
            className="pd-device-options"
            role="group"
            aria-label={t("product.device_label")}
          >
            {available.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={activeDevice === option}
                onClick={() => chooseDevice(option)}
                title={t(`product.device_${option}`)}
                aria-label={t(`product.device_${option}`)}
              >
                <DeviceIcon kind={option} />
              </button>
            ))}
          </div>
        )}
      </header>
      <div
        ref={stage}
        className="pd-preview"
        data-device={activeDevice}
        data-playing={playing}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocused(false);
        }}
      >
        <DeviceFrame image={shown[0]} kind={activeDevice}>
          <div
            className="pd-screen-motion"
            role="img"
            aria-label={current.caption || name}
          >
            <div className="pd-motion-visual" aria-hidden="true">
              {animated ? (
                <Suspense fallback={<Still image={current} />}>
                  <Motion
                    key={activeDevice}
                    images={shown}
                    playing={playing}
                    seek={seek}
                    onIndex={setIndex}
                  />
                </Suspense>
              ) : (
                <Still image={current} />
              )}
            </div>
          </div>
        </DeviceFrame>
        {shown.length > 1 && (
          <>
            <button
              className="pd-preview-nav is-prev"
              type="button"
              onClick={() => jump(at - 1)}
              aria-label={t("product.gallery_previous")}
              title={t("product.gallery_previous")}
            >
              <Icon name="arrow" className="flip" />
            </button>
            <button
              className="pd-preview-nav is-next"
              type="button"
              onClick={() => jump(at + 1)}
              aria-label={t("product.gallery_next")}
              title={t("product.gallery_next")}
            >
              <Icon name="arrow" />
            </button>
            <div
              className="pd-preview-dots"
              role="group"
              aria-label={t("product.gallery_choose")}
            >
              {shown.map((image, i) => (
                <button
                  key={`${image.url}-${i}-${seek.revision}`}
                  type="button"
                  aria-label={t("product.gallery_select", {
                    number: String(i + 1),
                    caption: image.caption || name,
                  })}
                  aria-pressed={i === at}
                  onClick={() => jump(i)}
                >
                  <span key={`${i}-${at}`} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
