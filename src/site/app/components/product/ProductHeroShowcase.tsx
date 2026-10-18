import type { DeviceKind, ProductMedia } from "../../types";
import { useSite } from "../../context";
import { safeUrl } from "../../lib/links";
import { Img } from "../Img";
import { DeviceFrame } from "./DeviceFrame";

const ORDER: DeviceKind[] = ["desktop", "tablet", "phone"];

/** One real capture for every available device, staged as a static product family. */
export function ProductHeroShowcase({
  frames,
  name,
  cover,
}: {
  frames: { device: DeviceKind; image: ProductMedia }[];
  name: string;
  cover?: ProductMedia;
}) {
  const { t } = useSite();
  const devices = ORDER.flatMap((device) => {
    const capture = frames.find((frame) => frame.device === device);
    return capture ? [capture] : [];
  });
  return (
    <div className="pd-hero-showcase">
      <div
        className="pd-hero-stage"
        role="group"
        aria-label={t("product.hero_devices")}
        data-count={devices.length}
        data-has-desktop={devices.some((frame) => frame.device === "desktop")}
        data-has-tablet={devices.some((frame) => frame.device === "tablet")}
        data-has-phone={devices.some((frame) => frame.device === "phone")}
      >
        <span className="pd-hero-halo" aria-hidden="true" />
        {!!devices.length && (
          <span className="pd-hero-ground" aria-hidden="true" />
        )}
        {devices.length ? (
          devices.map(({ device, image }, i) => (
            <figure
              key={device}
              className="pd-hero-unit"
              data-kind={device}
              aria-label={t(`product.device_${device}`)}
            >
              <DeviceFrame image={image} kind={device} priority={i === 0} />
            </figure>
          ))
        ) : cover && safeUrl(cover.url) ? (
          <div className="pd-hero-cover">
            <Img
              src={safeUrl(cover.url)}
              width={cover.width}
              height={cover.height}
              alt={cover.caption || name}
              sizes="(max-width: 767px) 90vw, 60vw"
              priority
              original
            />
          </div>
        ) : (
          <div className="pd-hero-placeholder">
            <img src="/assets/favicon.png" alt="" />
            <span>{name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
