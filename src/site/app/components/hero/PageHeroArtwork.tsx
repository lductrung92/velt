import { useId } from "react";
import { svgSin, svgCos } from "../../lib/svgMotion";

export type PageHeroKind = "products" | "blog";
export const PAGE_HERO_DURATION = 600;

export function PageHeroArtwork({
  kind,
  frame = 0,
}: {
  kind: PageHeroKind;
  frame?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const phase = (frame / PAGE_HERO_DURATION) * Math.PI * 2;
  const float = (offset: number) => svgSin(phase + offset) * 7;
  const blue = `hero-blue-${uid}`;
  const shadow = `hero-shadow-${uid}`;
  return (
    <svg
      className="page-hero-art"
      viewBox="0 0 640 440"
      fill="none"
      aria-hidden="true"
      data-art-frame={frame}
    >
      <defs>
        <linearGradient
          id={blue}
          x1="120"
          y1="70"
          x2="530"
          y2="380"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0061fd" />
          <stop offset="1" stopColor="#80b7ff" />
        </linearGradient>
        <filter id={shadow} x="-35%" y="-35%" width="180%" height="190%">
          <feDropShadow
            dx="0"
            dy="15"
            stdDeviation="13"
            floodColor="#1d4f9c"
            floodOpacity=".11"
          />
        </filter>
      </defs>
      <ellipse
        cx="350"
        cy="230"
        rx="230"
        ry="174"
        stroke="#b8d2fa"
        strokeDasharray="3 7"
        transform={`rotate(${-16 + svgSin(phase) * 3} 350 230)`}
      />
      <ellipse
        cx="350"
        cy="230"
        rx="268"
        ry="198"
        stroke="#d8e6fa"
        transform="rotate(-16 350 230)"
      />
      {Array.from({ length: 16 }, (_, i) => (
        <circle
          key={i}
          cx={70 + (i % 4) * 15}
          cy={70 + Math.floor(i / 4) * 15}
          r="1.6"
          fill="#8eb7f0"
          opacity=".5"
        />
      ))}
      <circle
        cx={350 + svgCos(phase) * 244}
        cy={230 + svgSin(phase) * 173}
        r="5"
        fill="#448eff"
        opacity=".65"
      />
      <path
        d="M543 325v16m-8-8h16M122 153v12m-6-6h12"
        stroke="#80aaff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {kind === "products" ? (
        <>
          <g transform={`translate(0 ${float(0)})`}>
            <rect
              x="194"
              y="105"
              width="330"
              height="240"
              rx="27"
              fill={`url(#${blue})`}
              transform="rotate(-9 359 225)"
            />
            <g filter={`url(#${shadow})`} transform="rotate(3 353 222)">
              <rect
                x="184"
                y="93"
                width="330"
                height="245"
                rx="19"
                fill="white"
                stroke="#d9e5f7"
              />
              <path d="M185 131h328" stroke="#e9eff9" />
              {[0, 1, 2].map((i) => (
                <circle
                  key={i}
                  cx={202 + i * 10}
                  cy="112"
                  r="3"
                  fill={i === 0 ? "#92b7fa" : "#dce6f5"}
                />
              ))}
              <rect
                x="201"
                y="150"
                width="38"
                height="168"
                rx="9"
                fill="#f2f6ff"
              />
              {[0, 1, 2, 3].map((i) => (
                <rect
                  key={i}
                  x="212"
                  y={164 + i * 33}
                  width="15"
                  height="15"
                  rx="4"
                  fill={i === 0 ? "#0061fd" : "#d3e2fa"}
                />
              ))}
              <rect
                x="256"
                y="152"
                width="122"
                height="8"
                rx="4"
                fill="#173c72"
              />
              <rect
                x="256"
                y="170"
                width="77"
                height="5"
                rx="2.5"
                fill="#d3dff0"
              />
              {[0, 1, 2].map((i) => (
                <g key={i}>
                  <rect
                    x={256 + i * 77}
                    y="192"
                    width="66"
                    height="46"
                    rx="9"
                    fill={["#eef4ff", "#f4efff", "#eaf8f5"][i]}
                  />
                  <rect
                    x={266 + i * 77}
                    y="202"
                    width="16"
                    height="16"
                    rx="5"
                    fill={["#6c9dff", "#b5a0f2", "#69c4b2"][i]}
                  />
                  <path
                    d={`M${266 + i * 77} 228h40`}
                    stroke="#d4dfed"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </g>
              ))}
              <rect
                x="256"
                y="251"
                width="220"
                height="67"
                rx="10"
                fill="#f7faff"
              />
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                const height = 14 + i * 4 + svgSin(phase + i * 0.7) * 6;
                return (
                  <rect
                    key={i}
                    x={272 + i * 27}
                    y={307 - height}
                    width="12"
                    height={height}
                    rx="3"
                    fill={i === 6 ? "#0061fd" : "#a7c7ff"}
                  />
                );
              })}
            </g>
          </g>
          <g
            transform={`translate(0 ${float(2)}) rotate(-7 151 282)`}
            filter={`url(#${shadow})`}
          >
            <rect
              x="54"
              y="219"
              width="168"
              height="128"
              rx="17"
              fill="white"
              stroke="#dce8f7"
            />
            <rect x="70" y="235" width="31" height="31" rx="9" fill="#eaf8f5" />
            <path
              d="m80 250 5 5 8-11"
              stroke="#39a992"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect
                  x="72"
                  y={282 + i * 17}
                  width="8"
                  height="8"
                  rx="2"
                  fill="#b6dcda"
                />
                <path
                  d={`M90 ${286 + i * 17}h${90 - i * 13}`}
                  stroke="#dce7f2"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>
          <g
            transform={`translate(0 ${float(4)}) rotate(8 472 92)`}
            filter={`url(#${shadow})`}
          >
            <rect
              x="398"
              y="36"
              width="156"
              height="108"
              rx="17"
              fill="white"
              stroke="#dedff7"
            />
            <rect x="414" y="53" width="29" height="29" rx="9" fill="#f1edff" />
            <path d="m423 67 5-6 6 6-6 6Z" stroke="#9b80e0" strokeWidth="1.5" />
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x={414 + i * 40}
                y={97 - i * 8}
                width="29"
                height={28 + i * 8}
                rx="5"
                fill={["#e8e1fb", "#d5c9f9", "#ac94ee"][i]}
              />
            ))}
          </g>
        </>
      ) : (
        <>
          <g transform={`translate(0 ${float(1)}) rotate(10 363 230)`}>
            <rect
              x="222"
              y="75"
              width="268"
              height="302"
              rx="20"
              fill="#dce9ff"
              stroke="#c5d9fc"
            />
          </g>
          <g
            transform={`translate(0 ${float(0)}) rotate(-5 324 218)`}
            filter={`url(#${shadow})`}
          >
            <rect
              x="178"
              y="55"
              width="274"
              height="312"
              rx="19"
              fill="white"
              stroke="#d9e5f7"
            />
            <rect x="199" y="78" width="77" height="6" rx="3" fill="#294d7c" />
            <circle cx="424" cy="81" r="4" fill="#c5d9f5" />
            <rect
              x="199"
              y="101"
              width="231"
              height="114"
              rx="12"
              fill={`url(#${blue})`}
            />
            <circle cx="368" cy="132" r="19" fill="#ffffff" opacity=".35" />
            <path
              d="m199 199 65-55 46 36 40-24 80 43v16H199Z"
              fill="white"
              opacity=".25"
            />
            <path d="m199 215 104-44 70 44" fill="white" opacity=".2" />
            <rect
              x="199"
              y="235"
              width="190"
              height="9"
              rx="4.5"
              fill="#183e73"
            />
            <rect
              x="199"
              y="254"
              width="151"
              height="9"
              rx="4.5"
              fill="#183e73"
            />
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x="199"
                y={280 + i * 12}
                width={i === 2 ? 135 : 221}
                height="4"
                rx="2"
                fill="#d6e1ef"
              />
            ))}
            <circle cx="207" cy="333" r="8" fill="#dfebfd" />
            <rect
              x="223"
              y="330"
              width="65"
              height="5"
              rx="2.5"
              fill="#b9cde9"
            />
          </g>
          <g
            transform={`translate(0 ${float(3)}) rotate(7 482 145)`}
            filter={`url(#${shadow})`}
          >
            <rect
              x="425"
              y="99"
              width="126"
              height="112"
              rx="18"
              fill="white"
              stroke="#e0ddf7"
            />
            <rect
              x="442"
              y="117"
              width="37"
              height="37"
              rx="11"
              fill="#f1edff"
            />
            <path
              d="M454 127h14v21l-7-5-7 5Z"
              stroke="#9a82df"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect
              x="442"
              y="169"
              width="88"
              height="5"
              rx="2.5"
              fill="#d8e0ee"
            />
            <rect
              x="442"
              y="183"
              width="57"
              height="5"
              rx="2.5"
              fill="#e4eaf3"
            />
          </g>
          <g
            transform={`translate(0 ${float(5)}) rotate(-10 145 287)`}
            filter={`url(#${shadow})`}
          >
            <rect
              x="78"
              y="247"
              width="132"
              height="88"
              rx="16"
              fill="white"
              stroke="#dae7fa"
            />
            <path d="m100 304 5-19 30-30 14 14-30 30Z" fill="#d9e9ff" />
            <path
              d="m105 285 14 14m16-44 14 14"
              stroke="#639af3"
              strokeWidth="2"
            />
            <path
              d="M143 298h48m-35 13h35"
              stroke="#c5d8f3"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        </>
      )}
    </svg>
  );
}
