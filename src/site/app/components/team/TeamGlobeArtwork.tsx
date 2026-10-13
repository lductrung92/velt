import { useId } from "react";
import { svgCos, svgSin } from "../../lib/svgMotion";
import type { T } from "../../lib/i18n";
import type { Member } from "../../types";

export const GLOBE_DURATION = 960;
type Geo = [number, number];
type Vec = { x: number; y: number; z: number };
export interface GlobeProps {
  members: Member[];
  activeId?: string;
  onSelect: (member: Member) => void;
  /**
   * The site's words. Passed in rather than read from the site context: this
   * artwork also renders inside the Remotion player, which owns its own tree.
   */
  t: T;
}

// Stylized geography, not a map of team locations or a territorial statement.
const land: Geo[][] = [
  [
    [-165, 62],
    [-142, 70],
    [-123, 58],
    [-105, 55],
    [-85, 58],
    [-62, 48],
    [-81, 29],
    [-98, 18],
    [-118, 31],
    [-130, 50],
  ],
  [
    [-80, 12],
    [-62, 8],
    [-48, -3],
    [-36, -10],
    [-47, -27],
    [-68, -55],
    [-76, -32],
    [-80, -10],
  ],
  [
    [-50, 60],
    [-43, 80],
    [-22, 78],
    [-27, 60],
  ],
  [
    [-17, 35],
    [8, 37],
    [34, 30],
    [50, 11],
    [40, -12],
    [23, -35],
    [12, -30],
    [5, -7],
    [-15, 8],
  ],
  [
    [-10, 36],
    [-10, 57],
    [10, 70],
    [37, 69],
    [58, 75],
    [91, 71],
    [130, 60],
    [168, 63],
    [159, 44],
    [126, 35],
    [120, 20],
    [108, 3],
    [98, 19],
    [80, 7],
    [68, 25],
    [45, 32],
    [36, 41],
    [15, 40],
  ],
  [
    [113, -22],
    [133, -12],
    [151, -22],
    [151, -38],
    [131, -35],
    [115, -34],
  ],
  [
    [47, -13],
    [50, -17],
    [47, -26],
    [44, -22],
  ],
  [
    [130, -3],
    [143, -5],
    [153, -10],
    [139, -10],
  ],
];
const slots = [
  [-48, 28],
  [18, 51],
  [58, -6],
  [-15, -34],
] as Geo[];
const colors = ["#0061fd", "#6c58c9", "#238e99", "#2255a9"];
const radius = 207;
const center = { x: 350, y: 328 };
function vector([longitude, latitude]: Geo, turn: number): Vec {
  const lon = (longitude * Math.PI) / 180 + turn;
  const lat = (latitude * Math.PI) / 180;
  return {
    x: svgCos(lat) * svgSin(lon),
    y: -svgSin(lat),
    z: svgCos(lat) * svgCos(lon),
  };
}
function point(p: Vec) {
  return `${(center.x + p.x * radius).toFixed(2)},${(center.y + p.y * radius).toFixed(2)}`;
}
function frontLine(coordinates: Geo[], turn: number) {
  let visible = false;
  return coordinates
    .map((c) => {
      const p = vector(c, turn);
      if (p.z < 0) {
        visible = false;
        return "";
      }
      const command = visible ? "L" : "M";
      visible = true;
      return command + point(p);
    })
    .join(" ");
}
function frontLand(coordinates: Geo[], turn: number) {
  const vertices: Vec[] = [];
  coordinates.forEach((a, i) => {
    const b = coordinates[(i + 1) % coordinates.length];
    const steps = Math.ceil(
      Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 4,
    );
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      vertices.push(
        vector([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], turn),
      );
    }
  });
  // Clip the polygon at the horizon, rather than showing land through the globe.
  const clipped: Vec[] = [];
  vertices.forEach((b, i) => {
    const a = vertices[(i + vertices.length - 1) % vertices.length];
    if (a.z >= 0 !== b.z >= 0) {
      const t = a.z / (a.z - b.z);
      clipped.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: 0,
      });
    }
    if (b.z >= 0) clipped.push(b);
  });
  return clipped.length > 2 ? "M" + clipped.map(point).join(" L") + " Z" : "";
}

function Character({ index, color }: { index: number; color: string }) {
  return (
    <>
      <ellipse cy="3" rx="24" ry="7" fill="#255ca1" opacity=".12" />
      <ellipse
        cy="0"
        rx="25"
        ry="7"
        fill="white"
        fillOpacity=".8"
        stroke="#bed6fb"
      />
      <path d="M-11-26 -12-4h10l3-22M3-26 5-4h10l-4-22" fill="#183b67" />
      <path
        d="M-13-5h10v6h-14q0-4 4-6M5-5h9q4 2 5 6H5Z"
        fill="#fff"
        stroke="#e2e9f4"
      />
      <path
        d="M-19-48q-7 4-9 18l8 3 3-10v15q17 7 34 0v-15l3 10 8-3q-2-14-9-18l-12-3H-7Z"
        fill={color}
      />
      <path
        d="M-8-51q8 10 16 0"
        stroke="white"
        strokeOpacity=".5"
        strokeWidth="2"
      />
      <path
        d="M-25-30v5M25-30v5"
        stroke="#f4d6c2"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="-5" y="-59" width="10" height="11" rx="4" fill="#eac4ad" />
      <ellipse cy="-71" rx="14" ry="17" fill="#f4d6c2" />
      <path
        d={
          index % 2
            ? "M-14-71q-5-23 15-22 20 0 13 22l-6-12q-7 8-20 7Z"
            : "M-14-70q-5-21 14-22 19-1 14 22l-6-14q-10 6-19 4Z"
        }
        fill="#253d61"
      />
      <path
        d="M-5-65q5 4 10 0"
        stroke="#b78372"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {index === 1 && (
        <g fill="none" stroke="#253d61" strokeWidth="1.4">
          <rect x="-12" y="-75" width="10" height="7" rx="3" />
          <rect x="2" y="-75" width="10" height="7" rx="3" />
          <path d="M-2-72h4" />
        </g>
      )}
      {index === 2 && (
        <g>
          <rect
            x="-19"
            y="-39"
            width="38"
            height="24"
            rx="3"
            fill="#f7faff"
            stroke="#c8d7ed"
          />
          <path
            d="M-23-15h46"
            stroke="#b8cbe7"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="m-3-30 6 3-6 3" stroke={color} strokeWidth="2" />
        </g>
      )}
      {index === 3 && (
        <path
          d="M-11-38h8m6 0h8"
          stroke="white"
          strokeOpacity=".6"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

export function TeamGlobeArtwork({
  members,
  activeId,
  onSelect,
  t,
  frame = 0,
}: GlobeProps & { frame?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  const angle = (frame / GLOBE_DURATION) * Math.PI * 2;
  const turn = angle + 0.55;
  return (
    <svg
      viewBox="0 0 720 600"
      width="720"
      height="600"
      className="team-globe-art"
      role="group"
      aria-label={t("team.globe_art")}
      data-globe-frame={frame}
    >
      <defs>
        <radialGradient id={`${id}-sphere`} cx="32%" cy="25%" r="80%">
          <stop stopColor="#f6fbff" />
          <stop offset=".4" stopColor="#deeeff" />
          <stop offset=".8" stopColor="#a9cbff" />
          <stop offset="1" stopColor="#77a8ef" />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="30%" cy="23%" r="80%">
          <stop offset=".45" stopColor="#0061fd" stopOpacity="0" />
          <stop offset="1" stopColor="#174b9c" stopOpacity=".26" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#0061fd" stopOpacity=".13" />
          <stop offset="1" stopColor="#0061fd" stopOpacity="0" />
        </radialGradient>
        <filter
          id={`${id}-shadow`}
          x="-40%"
          y="-40%"
          width="180%"
          height="190%"
        >
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="8"
            floodColor="#163b70"
            floodOpacity=".13"
          />
        </filter>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <circle cx={center.x} cy={center.y} r={radius} />
        </clipPath>
      </defs>
      <ellipse cx="350" cy="326" rx="338" ry="273" fill={ref("halo")} />
      <ellipse
        cx="350"
        cy="558"
        rx="169"
        ry="13"
        fill="#194a97"
        opacity=".1"
        filter={ref("blur")}
      />
      <ellipse
        cx="350"
        cy="335"
        rx="290"
        ry="86"
        transform="rotate(-19 350 335)"
        fill="none"
        stroke="#c4d8f5"
        strokeDasharray="3 8"
      />
      <circle
        cx={350 + svgCos(angle) * 272}
        cy={335 + svgSin(angle) * 100}
        r="5"
        fill="#568bec"
        opacity=".5"
      />
      <g transform="translate(55 48)">
        <image href="/assets/logo.png" width="183" height="40" />
        <text x="2" y="61" fill="#617895" fontSize="13">
          Build Simple. Grow Beyond.
        </text>
      </g>
      <g clipPath={ref("clip")}>
        <circle cx={center.x} cy={center.y} r={radius} fill={ref("sphere")} />
        {land.map((polygon, i) => (
          <path
            key={i}
            d={frontLand(polygon, turn)}
            fill="#7daaf0"
            fillOpacity=".58"
            stroke="#649bea"
            strokeWidth=".65"
            strokeLinejoin="round"
          />
        ))}
        {[-60, -30, 0, 30, 60].map((lat) => (
          <path
            key={lat}
            d={frontLine(
              Array.from({ length: 121 }, (_, i) => [i * 3 - 180, lat]),
              turn,
            )}
            stroke="#fff"
            strokeOpacity=".5"
            fill="none"
          />
        ))}
        {Array.from({ length: 12 }, (_, i) => i * 30).map((lon) => (
          <path
            key={lon}
            d={frontLine(
              Array.from({ length: 61 }, (_, i) => [lon, i * 3 - 90]),
              turn,
            )}
            stroke="#fff"
            strokeOpacity=".45"
            fill="none"
          />
        ))}
        <circle cx={center.x} cy={center.y} r={radius} fill={ref("shade")} />
      </g>
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        stroke="white"
        strokeOpacity=".85"
        strokeWidth="2"
      />
      <circle
        cx={center.x}
        cy={center.y}
        r={radius + 8}
        fill="none"
        stroke="#d3e3fa"
        strokeOpacity=".6"
      />
      {members.slice(0, 4).map((member, index) => {
        // People stay on the visible hemisphere so all four profiles remain discoverable.
        // Their decorative anchors do not encode anyone's location.
        const anchor = vector(slots[index], svgSin(angle) * 0.035);
        const x = center.x + anchor.x * radius;
        const y = center.y + anchor.y * radius;
        const color = colors[index];
        const active = member.id === activeId;
        const labelWidth = Math.min(
          188,
          Math.max(116, member.name.length * 7 + 28),
        );
        return (
          <g
            key={member.id}
            className="globe-person"
            transform={`translate(${x} ${y})`}
            role="button"
            tabIndex={0}
            aria-label={t("team.globe_open_profile", { name: member.name })}
            onClick={() => onSelect(member)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(member);
              }
            }}
            data-globe-member={member.id}
          >
            <rect
              className="globe-person-focus"
              x="-38"
              y="-101"
              width="76"
              height="108"
              rx="20"
              fill="transparent"
            />
            <ellipse
              cy="1"
              rx={active ? 34 : 27}
              ry={active ? 10 : 8}
              fill="none"
              stroke={color}
              strokeWidth={active ? 2 : 1}
              strokeOpacity={active ? 0.6 : 0.25}
            />
            <g
              transform={`translate(0 ${svgSin(angle + index * 1.4) * 2})`}
              filter={ref("shadow")}
            >
              <Character index={index} color={color} />
            </g>
            <g transform={`translate(${-labelWidth / 2} 15)`}>
              <rect
                width={labelWidth}
                height="27"
                rx="13.5"
                fill={active ? color : "white"}
                stroke={active ? color : "#d6e3f7"}
              />
              <text
                x={labelWidth / 2}
                y="18"
                textAnchor="middle"
                fill={active ? "white" : "#29456c"}
                fontSize="12"
                fontWeight="500"
              >
                {member.name.length > 23
                  ? member.name.slice(0, 22) + "…"
                  : member.name}
              </text>
            </g>
          </g>
        );
      })}
      <g transform={`translate(589 ${87 + svgSin(angle) * 5}) rotate(12)`}>
        <rect width="46" height="46" rx="13" fill="white" stroke="#dce7f6" />
        <path
          d="m17 16-7 7 7 7m12-14 7 7-7 7m-4-17-4 22"
          fill="none"
          stroke="#618eec"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="m81 433 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"
        fill="none"
        stroke="#8aaeee"
        strokeWidth="1.4"
      />
    </svg>
  );
}
