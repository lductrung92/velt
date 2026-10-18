import { Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { MediaDevice } from "../services/products.service";

/** The icon each device is known by, on the tabs and on the cards. */
export const DEVICE_ICON: Record<MediaDevice, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

// Only `/img/{slug}.{ext}` has a `/files` sibling. An older entry keeps its
// `/api/files/...` URL, which is already the original.
const MEDIA = /^((?:https?:\/\/[^/]+)?)\/img\/([^/]+)\.(webp|jpg|png)$/;

/**
 * The unchanged bytes, not a rendering of them.
 *
 * `/img` re-encodes what it serves (WebP q80 for anything that samples as a
 * photograph, which a UI screenshot does — antialiased text, avatars and
 * gradients put it well past the flat-artwork threshold). Measured on one of
 * these captures: the upload loses ~2 dB on the way out through `/img`, and
 * text is where it shows. `/files` hands back exactly what was stored.
 *
 * The site does the same thing for the same reason (Img, `original`).
 */
export function originalImageUrl(src: string) {
  const media = MEDIA.exec(src);
  return media ? `${media[1]}/files/${media[2]}.${media[3]}` : src;
}

/**
 * A screenshot inside the shell of the device it was taken on — the same
 * frame the public product page draws (site: pd-device), so what is being
 * edited looks like what gets published.
 *
 * `size` is the difference between the two places it appears:
 *   mini — a grid thumbnail, sized by the height it is given
 *   full — the viewer, sized by the width it is given
 *
 * A frame is decoration. It says what the capture was taken on, not that the
 * product has a native app on it.
 */
export function DeviceFrame({
  src,
  alt,
  device,
  size = "mini",
  className,
}: {
  src: string | null;
  alt: string;
  /** No device means no shell: the picture is shown plain. */
  device: MediaDevice | null;
  size?: "mini" | "full";
  className?: string;
}) {
  // A deployment whose images come from a CDN may not expose /files. Falling
  // back to the given URL keeps the picture on screen rather than breaking it
  // for the sake of a few dB.
  const [failed, setFailed] = useState<string | null>(null);
  const original = src ? originalImageUrl(src) : null;
  const shown = original && failed === original ? src : original;

  const picture = shown ? (
    <img
      src={shown}
      alt={alt}
      onError={() => shown !== src && setFailed(shown)}
    />
  ) : null;

  if (!device) {
    return picture ? (
      <img
        src={shown!}
        alt={alt}
        className={cn("kd-device-bare", className)}
        onError={() => shown !== src && setFailed(shown!)}
      />
    ) : null;
  }
  return (
    <div
      className={cn("kd-device", className)}
      data-device={device}
      data-size={size}
    >
      <div className="kd-device-shell">
        <span className="kd-device-camera" aria-hidden />
        <div className="kd-device-screen">{picture}</div>
      </div>
      <span className="kd-device-base" aria-hidden />
    </div>
  );
}
