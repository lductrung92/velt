import { interpolate, useCurrentFrame } from "remotion";

export function LaunchScene({ width }: { width: number }) {
  const frame = useCurrentFrame();
  const phase = ((frame + 120) % 240) / 240;
  const angle = (frame / 240) * Math.PI * 2;
  const blue = "hsl(var(--primary))";
  const opacity = interpolate(phase, [0, 0.08, 0.9, 1], [0, 1, 1, 0]);
  const flight = interpolate(phase, [0, 0.18, 0.75, 1], [0, 0, 38, 44]);
  return (
    <svg
      x={14}
      y={54}
      width={width - 28}
      height={126}
      viewBox="0 0 260 126"
      data-workday-scene="launch"
    >
      <rect
        x={84}
        y={4}
        width={170}
        height={114}
        rx={8}
        fill="hsl(var(--card))"
        stroke={blue}
        strokeOpacity={0.18}
      />
      <path d="M84 23 H254" stroke={blue} strokeOpacity={0.1} />
      {[0, 1, 2].map((dot) => (
        <circle
          key={dot}
          cx={96 + dot * 7}
          cy={14}
          r={2}
          fill={blue}
          opacity={0.25}
        />
      ))}
      <path
        d="M96 76 l14-8 15 3 14-19 15 6 15-16"
        fill="none"
        stroke={blue}
        strokeWidth={2}
        strokeLinecap="round"
        strokeOpacity={0.55}
        pathLength={100}
        strokeDasharray={`${phase * 100} 100`}
      />
      {[0, 1, 2, 3, 4].map((bar) => {
        const h = 12 + (1 + Math.sin(angle + bar * 0.6)) * (8 + bar * 3);
        return (
          <rect
            key={bar}
            x={184 + bar * 12}
            y={88 - h}
            width={8}
            height={h}
            rx={2}
            fill={blue}
            opacity={0.14 + bar * 0.09}
          />
        );
      })}
      <circle cx={99} cy={103} r={3} fill={blue} opacity={0.65} />
      <rect
        x={109}
        y={101}
        width={125}
        height={4}
        rx={2}
        fill={blue}
        opacity={0.18}
      />
      <g
        transform={`translate(${37 + flight * 0.28}, ${77 - flight})`}
        opacity={opacity}
      >
        <path
          d="M0-30 C-16-20-16 2-8 13 H8 C16 2 16-20 0-30 Z"
          fill="hsl(var(--card))"
          stroke={blue}
          strokeWidth={1.5}
          strokeOpacity={0.7}
        />
        <circle cy={-9} r={4} fill={blue} opacity={0.25} />
        <path
          d="M-10 0 L-18 15 L-7 10 M10 0 L18 15 L7 10"
          fill={blue}
          fillOpacity={0.12}
          stroke={blue}
          strokeOpacity={0.4}
        />
        <path
          d={`M-4 16 Q0 ${27 + Math.sin(angle * 4) * 6} 4 16`}
          fill={blue}
          opacity={0.4}
        />
      </g>
      {[0, 1, 2].map((ring) => (
        <circle
          key={ring}
          cx={39}
          cy={100}
          r={10 + ((phase + ring / 3) % 1) * 24}
          fill="none"
          stroke={blue}
          strokeOpacity={(1 - ((phase + ring / 3) % 1)) * 0.25}
        />
      ))}
    </svg>
  );
}
