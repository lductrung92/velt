import { interpolate, useCurrentFrame } from "remotion";

export function BuildScene({ width }: { width: number }) {
  const frame = useCurrentFrame();
  const phase = ((frame + 80) % 240) / 240;
  const blue = "hsl(var(--primary))";
  const reveal = (offset: number) =>
    interpolate(phase, [offset, offset + 0.08], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const fade = interpolate(phase, [0, 0.04, 0.9, 1], [0, 1, 1, 0]);
  return (
    <svg
      x={14}
      y={54}
      width={width - 28}
      height={126}
      viewBox="0 0 260 126"
      data-workday-scene="build"
    >
      <rect
        x={2}
        y={2}
        width={167}
        height={120}
        rx={8}
        fill={blue}
        fillOpacity={0.035}
        stroke={blue}
        strokeOpacity={0.15}
      />
      <path
        d="M13 15 H48 M57 15 H75"
        stroke={blue}
        strokeOpacity={0.3}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path d="M2 25 H169" stroke={blue} strokeOpacity={0.1} />
      <g opacity={fade}>
        {[0, 1, 2, 3, 4].map((line) => (
          <g key={line}>
            <circle
              cx={13}
              cy={38 + line * 15}
              r={1.5}
              fill={blue}
              opacity={0.25}
            />
            <rect
              x={25 + (line % 3) * 8}
              y={36 + line * 15}
              width={(38 + (line % 2) * 16) * reveal(line * 0.07)}
              height={4}
              rx={2}
              fill={blue}
              opacity={0.45}
            />
            <rect
              x={91}
              y={36 + line * 15}
              width={(30 + line * 5) * reveal(line * 0.07 + 0.04)}
              height={4}
              rx={2}
              fill={blue}
              opacity={0.18}
            />
          </g>
        ))}
        <rect
          x={26 + reveal(0.32) * 65}
          y={111}
          width={3}
          height={7}
          rx={1}
          fill={blue}
          opacity={0.4 + Math.sin(frame / 6) * 0.3}
        />
      </g>
      <path
        d="M169 64 H189 M189 32 V98 M189 32 H211 M189 64 H211 M189 98 H211"
        fill="none"
        stroke={blue}
        strokeOpacity={0.2}
        strokeWidth={1.5}
      />
      {[0, 1, 2].map((check) => (
        <g key={check}>
          <rect
            x={209}
            y={20 + check * 33}
            width={45}
            height={25}
            rx={6}
            fill="hsl(var(--card))"
            stroke={blue}
            strokeOpacity={0.2}
          />
          <circle
            cx={221}
            cy={32 + check * 33}
            r={4}
            fill={blue}
            opacity={0.15}
          />
          <path
            d={`M233 ${32 + check * 33} l3 3 6-7`}
            fill="none"
            stroke={blue}
            strokeWidth={1.7}
            strokeLinecap="round"
            opacity={reveal(0.5 + check * 0.12) * fade}
          />
        </g>
      ))}
    </svg>
  );
}
