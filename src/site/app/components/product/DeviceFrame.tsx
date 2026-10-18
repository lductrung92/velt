import { useState, type CSSProperties, type ReactNode } from "react";
import type { DeviceKind, ProductMedia } from "../../types";
import { useSite } from "../../context";
import { safeUrl } from "../../lib/links";
import { Img } from "../Img";

export type { DeviceKind };

/** The three the console offers, in the order the switcher shows them. */
export const DEVICES: DeviceKind[] = ["phone", "tablet", "desktop"];

/**
 * Which device a capture belongs to.
 *
 * The console stores this now. The ratio fallback is only for captures
 * uploaded before that column existed: their shape is the last evidence
 * left, and guessing beats dropping the picture out of every tab. Anything
 * uploaded since says so itself.
 */
export function imageDevice(image: ProductMedia): DeviceKind {
  if (image.device) return image.device;
  const ratio = image.width && image.height ? image.width / image.height : 1.6;
  return ratio < 0.61 ? "phone" : ratio < 1.05 ? "tablet" : "desktop";
}

/**
 * The capture the hero shows for a device: the one flagged in the console,
 * or the first of that device when nobody has chosen one.
 */
export function heroFor(
  images: ProductMedia[],
  device: DeviceKind,
): ProductMedia | undefined {
  const own = images.filter((image) => imageDevice(image) === device);
  return own.find((image) => image.isHero) || own[0];
}

export function DeviceIcon({ kind }: { kind: DeviceKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "phone" ? (
        <>
          <rect x="6" y="2" width="12" height="20" rx="3" />
          <path d="M10 5h4m-3 14h2" />
        </>
      ) : kind === "tablet" ? (
        <>
          <rect x="3" y="2" width="18" height="20" rx="2.5" />
          <path d="M11 19h2" />
        </>
      ) : (
        <>
          <rect x="4" y="3" width="16" height="13" rx="1.5" />
          <path d="m4 16-2 4h20l-2-4M9 20h6" />
        </>
      )}
    </svg>
  );
}

/** Frames are presentation only: a phone frame does not imply a native app. */
export function DeviceFrame({
  image,
  kind,
  priority = false,
  children,
}: {
  image: ProductMedia;
  kind: DeviceKind;
  priority?: boolean;
  children?: ReactNode;
}) {
  const { t } = useSite();
  const [failed, setFailed] = useState("");
  const src = safeUrl(image.url);
  const matchingShape = imageDevice(image) === kind;
  const ratio = image.width && image.height ? image.width / image.height : 0;
  // A long, full-page capture still needs to fit inside the viewport. Use
  // contain in the standard screen shape rather than growing past the stage.
  const viewportShape =
    kind === "phone"
      ? ratio >= 0.4 && ratio <= 0.7
      : kind === "tablet"
        ? ratio >= 0.6 && ratio <= 1.7
        : ratio >= 1.25 && ratio <= 2.4;
  const aspectRatio =
    matchingShape && viewportShape && image.width && image.height
      ? `${image.width} / ${image.height}`
      : undefined;
  return (
    <div
      className="pd-device"
      data-device={kind === "desktop" ? "laptop" : kind}
      style={
        aspectRatio
          ? ({ "--pd-screen-ratio": ratio } as CSSProperties)
          : undefined
      }
    >
      <div className="pd-device-shell">
        <span className="pd-device-camera" aria-hidden="true" />
        <div className="pd-device-screen" style={{ aspectRatio }}>
          {children ??
            (src && failed !== src ? (
              <Img
                src={src}
                width={image.width}
                height={image.height}
                alt={image.caption || t("product.gallery_image")}
                sizes={
                  priority
                    ? "(max-width: 767px) 75vw, 540px"
                    : "(max-width: 767px) 85vw, 760px"
                }
                priority={priority}
                original
                onError={() => setFailed(src)}
              />
            ) : (
              <div className="pd-image-empty">
                <DeviceIcon kind={kind} />
                <span>{t("product.image_unavailable")}</span>
              </div>
            ))}
        </div>
      </div>
      <span className="pd-device-base" aria-hidden="true" />
    </div>
  );
}
