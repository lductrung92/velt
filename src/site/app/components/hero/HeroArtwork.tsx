import { useId } from "react";
import { useSite } from "../../context";
import type { T } from "../../lib/i18n";
import { svgCos, svgPrecision, svgSin } from "../../lib/svgMotion";

// Concept art only: independent products under one brand, not shared accounts/data.
// This pure SVG also renders on the server and when motion is disabled.
export const HERO_DURATION = 420;

// `id` names the card; its words live in the message tables under hero.art.
const audiences = [
  {
    id: "individual",
    color: "#0061fd",
    tint: "#eaf2ff",
    x: 33,
    y: 185,
    tilt: -5,
    scale: 0.97,
  },
  {
    id: "group",
    color: "#7758d8",
    tint: "#f2edff",
    x: 426,
    y: 114,
    tilt: 5,
    scale: 1.04,
  },
  {
    id: "shop",
    color: "#c77732",
    tint: "#fff3e6",
    x: 70,
    y: 425,
    tilt: -3,
    scale: 0.97,
  },
  {
    id: "business",
    color: "#178b82",
    tint: "#e6f6f2",
    x: 430,
    y: 351,
    tilt: 4,
    scale: 1.02,
  },
] as const;

function AudienceIcon({ index }: { index: number }) {
  if (index === 0)
    return (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    );
  if (index === 1)
    return (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 4 6" />
      </>
    );
  if (index === 2)
    return (
      <>
        <path d="M3 10h18l-2-7H5l-2 7Zm1 0v12h16V10M8 22v-7h5v7M2 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 4 4 0 0 0 8 0" />
      </>
    );
  return (
    <>
      <rect x="4" y="2" width="16" height="21" rx="2" />
      <path d="M8 7h2m4 0h2M8 12h2m4 0h2M10 23v-5h4v5" />
    </>
  );
}

const taskKeys = [
  "hero.art.task.one",
  "hero.art.task.two",
  "hero.art.task.three",
] as const;
const boardKeys = [
  "hero.art.board.todo",
  "hero.art.board.doing",
  "hero.art.board.done",
] as const;

function ProductPreview({
  index,
  progress,
  color,
  tint,
  t,
}: {
  index: number;
  progress: number;
  color: string;
  tint: string;
  t: T;
}) {
  if (index === 0)
    return (
      <>
        <rect x="24" y="68" width="62" height="82" rx="9" fill={tint} />
        <circle cx="55" cy="126" r="12" fill="white" />
        <path
          d="m50 126 4 4 7-8"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="38"
          y="83"
          width="34"
          height="5"
          rx="2.5"
          fill={color}
          opacity=".45"
        />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(110 ${78 + i * 26})`}>
            <rect width="15" height="15" rx="4" fill={i === 0 ? color : tint} />
            <path
              d="m4 7 3 3 5-6"
              fill="none"
              stroke={i === 0 ? "white" : color}
              strokeWidth="1.8"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={
                i === 0 ? 0 : 1 - Math.min(1, progress * (i === 1 ? 1.7 : 1.2))
              }
            />
            <text x="27" y="11" fill="#29456c" fontSize="13" fontWeight="500">
              {t(taskKeys[i])}
            </text>
            <rect
              x="27"
              y="18"
              width={92 - i * 16}
              height="3"
              rx="1.5"
              fill="#edf1f7"
            />
          </g>
        ))}
        <path
          d="M37 102h34"
          stroke={color}
          strokeWidth="3"
          opacity=".25"
          strokeLinecap="round"
        />
      </>
    );
  if (index === 1)
    return (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${22 + i * 107} 67)`}>
            <rect
              width="94"
              height="86"
              rx="7"
              fill={i === 2 ? tint : "#f4f7fb"}
            />
            <text
              x="10"
              y="17"
              fill={i === 2 ? color : "#617895"}
              fontSize="10"
              fontWeight="600"
            >
              {t(boardKeys[i])}
            </text>
            <rect
              x="8"
              y="28"
              width="78"
              height="36"
              rx="5"
              fill="white"
              stroke="#e4eaf3"
            />
            <rect x="16" y="38" width="48" height="4" rx="2" fill="#d4dfed" />
            <rect x="16" y="47" width="29" height="3" rx="1.5" fill="#e6edf6" />
            <circle
              cx="73"
              cy="75"
              r="5"
              fill={color}
              opacity={0.2 + progress * 0.3}
            />
          </g>
        ))}
        <g transform={`translate(${30 + progress * 214} 101)`}>
          <rect
            width="78"
            height="40"
            rx="6"
            fill="white"
            stroke={color}
            strokeOpacity=".5"
          />
          <rect
            x="10"
            y="10"
            width="46"
            height="4"
            rx="2"
            fill={color}
            opacity=".5"
          />
          <rect x="10" y="20" width="28" height="3" rx="1.5" fill="#d4dfed" />
          <circle cx="63" cy="28" r="5" fill={tint} />
        </g>
      </>
    );
  if (index === 2)
    return (
      <>
        <rect x="23" y="68" width="132" height="85" rx="8" fill={tint} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g
            key={i}
            transform={`translate(${35 + (i % 3) * 37} ${81 + Math.floor(i / 3) * 30})`}
          >
            <rect width="28" height="22" rx="5" fill="white" stroke="#f2d9bd" />
            <path
              d={
                i % 2
                  ? "M9 7h10v9H9Z M9 7l5-3 5 3 M14 7v9"
                  : "M10 6h8l2 11H8Z M12 6V4h4v2"
              }
              stroke={color}
              strokeOpacity=".6"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </g>
        ))}
        <rect
          x="187"
          y="67"
          width="130"
          height="86"
          rx="7"
          fill="white"
          stroke="#e7edf5"
        />
        <text x="203" y="85" fill={color} fontSize="11" fontWeight="600">
          {t("hero.art.receipt")}
        </text>
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x="203"
            y={99 + i * 14}
            width={(78 - i * 13) * (0.65 + progress * 0.35)}
            height="4"
            rx="2"
            fill="#dfe7f2"
            opacity={0.45 + progress * 0.55}
          />
        ))}
        <circle cx="297" cy="132" r="11" fill={tint} />
        <path
          d="m292 132 4 4 7-8"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
        />
      </>
    );
  return (
    <>
      <rect x="23" y="68" width="302" height="85" rx="8" fill="#f4f8fb" />
      <path
        d="M42 85h152m-152 22h152m-152 22h152"
        stroke="#e3ebf2"
        strokeWidth="1"
      />
      {[26, 43, 32, 58, 49, 64].map((height, i) => (
        <rect
          key={i}
          x={47 + i * 25}
          y={139 - height * (0.55 + progress * 0.45)}
          width="13"
          height={height * (0.55 + progress * 0.45)}
          rx="4"
          fill={color}
          opacity={0.22 + i * 0.12}
        />
      ))}
      <circle
        cx="266"
        cy="111"
        r="23"
        fill="none"
        stroke="#dcece9"
        strokeWidth="9"
      />
      <circle
        cx="266"
        cy="111"
        r="23"
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray={`${0.25 + progress * 0.5} 1`}
        transform="rotate(-90 266 111)"
      />
    </>
  );
}

export function HeroArtwork({ frame = 0 }: { frame?: number }) {
  const { t } = useSite();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  const angle = (frame / HERO_DURATION) * Math.PI * 2;
  return (
    <svg
      className="hero-ecosystem-art"
      viewBox="0 0 840 700"
      width="840"
      height="700"
      fill="none"
      aria-hidden="true"
      data-hero-frame={frame}
    >
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#77b3ff" stopOpacity=".32" />
          <stop offset="1" stopColor="#77b3ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-violet`}>
          <stop stopColor="#baa1ff" stopOpacity=".25" />
          <stop offset="1" stopColor="#baa1ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`${id}-ribbon`}
          x1="270"
          y1="130"
          x2="590"
          y2="620"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#80baff" />
          <stop offset=".45" stopColor="#126aff" />
          <stop offset="1" stopColor="#4258ec" />
        </linearGradient>
        <linearGradient
          id={`${id}-surface`}
          x1="0"
          y1="0"
          x2="0"
          y2="202"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#fcfdff" />
        </linearGradient>
        <linearGradient
          id={`${id}-edge`}
          x1="0"
          y1="0"
          x2="350"
          y2="202"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#cad9ef" />
        </linearGradient>
        <filter
          id={`${id}-shadow`}
          x="-25%"
          y="-40%"
          width="160%"
          height="200%"
        >
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="2"
            floodColor="#00234b"
            floodOpacity=".04"
          />
          <feDropShadow
            dx="0"
            dy="20"
            stdDeviation="17"
            floodColor="#123c78"
            floodOpacity=".12"
          />
        </filter>
        <filter
          id={`${id}-soft`}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <pattern
          id={`${id}-dots`}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1" fill="#9dbbdf" fillOpacity=".4" />
        </pattern>
      </defs>

      {/* Atmospheric layers have no links or shared-data meaning. */}
      <ellipse
        cx={440 + svgSin(angle) * 16}
        cy="337"
        rx="395"
        ry="300"
        fill={ref("halo")}
      />
      <ellipse
        cx="635"
        cy={340 + svgCos(angle) * 12}
        rx="230"
        ry="255"
        fill={ref("violet")}
      />
      <rect x="624" y="37" width="156" height="90" fill={ref("dots")} />
      <rect x="7" y="426" width="115" height="155" fill={ref("dots")} />
      <ellipse
        cx="432"
        cy="624"
        rx="290"
        ry="22"
        fill="#335a9b"
        opacity=".07"
        filter={ref("soft")}
      />
      <g transform={`rotate(${-18 + svgSin(angle) * 2} 430 350)`}>
        <rect
          x="210"
          y="130"
          width="420"
          height="430"
          rx="100"
          fill={ref("ribbon")}
          opacity=".82"
        />
        <rect
          x="230"
          y="130"
          width="400"
          height="412"
          rx="90"
          fill="white"
          opacity=".05"
        />
        <path
          d="M267 133c-46 126 118 164 363 140M211 430c143-22 273 34 370 125"
          stroke="white"
          strokeOpacity=".28"
        />
        <path
          d="M298 129c-30 77 100 102 327 77"
          stroke="white"
          strokeWidth="30"
          strokeOpacity=".07"
        />
      </g>
      <ellipse
        cx="435"
        cy="357"
        rx="385"
        ry="237"
        transform="rotate(-18 435 357)"
        stroke="#b9cdef"
        strokeDasharray="3 9"
        strokeOpacity=".6"
      />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const phase = angle + (i * Math.PI) / 3;
        const x = 420 + svgCos(phase) * 366;
        const y = 350 + svgSin(phase) * 260;
        return (
          <g key={i} opacity={0.3 + (svgSin(phase) + 1) * 0.2}>
            <circle cx={x} cy={y} r="10" fill="#0061fd" opacity=".06" />
            <circle cx={x} cy={y} r={i % 2 ? 2 : 3} fill="#5689ed" />
          </g>
        );
      })}

      <g transform={`translate(72 ${40 + svgSin(angle + 0.5) * 3})`}>
        <image
          href="/assets/logo.png"
          width="218"
          height="48"
          preserveAspectRatio="xMidYMid meet"
        />
        <text x="4" y="76" fill="#42628b" fontSize="16" fontWeight="500">
          Build Simple. Grow Beyond.
        </text>
      </g>
      <g transform={`translate(736 ${35 + svgCos(angle) * 5}) rotate(12)`}>
        <rect width="44" height="44" rx="13" fill="white" stroke="#e0e9f7" />
        <path
          d="m22 10 3.5 8.5L34 22l-8.5 3.5L22 34l-3.5-8.5L10 22l8.5-3.5Z"
          stroke="#4178f0"
          strokeWidth="1.6"
        />
      </g>

      {audiences.map((audience, index) => {
        // Periodic easing keeps the complete 14-second loop seamless.
        const phase = angle - (index * Math.PI) / 2;
        const attention = svgPrecision(Math.pow((svgCos(phase) + 1) / 2, 4));
        const progress = (svgSin(phase) + 1) / 2;
        const y = audience.y - svgSin(angle - index * 0.8) * 8 - attention * 5;
        const tilt = audience.tilt + svgSin(angle - index * 0.7) * 1.2;
        return (
          <g
            key={audience.id}
            data-product-preview={index}
            transform={`translate(${audience.x} ${y}) rotate(${tilt} 175 100) scale(${audience.scale})`}
          >
            <g filter={ref("shadow")}>
              <rect y="5" width="350" height="202" rx="18" fill="#dce5f4" />
              <rect width="350" height="202" rx="18" fill={ref("surface")} />
              <rect
                x=".5"
                y=".5"
                width="349"
                height="201"
                rx="17.5"
                stroke={ref("edge")}
              />
            </g>
            <rect
              x="1"
              y="1"
              width="348"
              height="200"
              rx="17"
              stroke={audience.color}
              strokeOpacity={0.08 + attention * 0.5}
              strokeWidth={1 + attention}
            />
            <path d="M1 49h348M18 166h314" stroke="#eaf0f7" />
            <rect
              x="17"
              y="11"
              width="29"
              height="29"
              rx="9"
              fill={audience.tint}
            />
            <g
              transform="translate(23 17) scale(.7)"
              stroke={audience.color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <AudienceIcon index={index} />
            </g>
            <text x="57" y="32" fill="#00234b" fontSize="19" fontWeight="650">
              {t(`hero.art.${audience.id}.label`)}
            </text>
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx={304 + i * 11}
                cy="25"
                r="2.5"
                fill="#a7b6cc"
                opacity={i === 0 ? 0.7 : 0.4}
              />
            ))}
            <ProductPreview
              index={index}
              progress={progress}
              color={audience.color}
              tint={audience.tint}
              t={t}
            />
            <circle
              cx="26"
              cy="184"
              r="3"
              fill={audience.color}
              opacity=".65"
            />
            <text x="38" y="189" fill="#617895" fontSize="12">
              {t(`hero.art.${audience.id}.detail`)}
            </text>
            <rect
              x="285"
              y="179"
              width="44"
              height="9"
              rx="4.5"
              fill={audience.tint}
            />
            <rect
              x="285"
              y="179"
              width={12 + progress * 32}
              height="9"
              rx="4.5"
              fill={audience.color}
              opacity=".4"
            />
            {/* Stylized cursor indicates interaction inside this illustration only. */}
            <g
              transform={`translate(${240 + progress * 40} ${105 + svgSin(phase) * 15})`}
              opacity={attention * 0.8}
            >
              <circle
                r={8 + progress * 10}
                fill="none"
                stroke={audience.color}
                opacity={1 - progress}
              />
              <path
                d="m0 0 0 17 4-4 4 8 4-2-4-8 6-1Z"
                fill={audience.color}
                stroke="white"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </g>
          </g>
        );
      })}
      <g transform="translate(416 628)">
        <rect
          width="360"
          height="38"
          rx="19"
          fill="white"
          fillOpacity=".9"
          stroke="#dce6f6"
        />
        <path
          d="m19 19 4 4 7-8"
          stroke="#0061fd"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="42" y="24" fill="#42628b" fontSize="14">
          {t("hero.art.footer")}
        </text>
      </g>
    </svg>
  );
}
