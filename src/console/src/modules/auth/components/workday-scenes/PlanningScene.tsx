import { interpolate, useCurrentFrame } from "remotion";

export function PlanningScene({ width }: { width: number }) {
  const frame = useCurrentFrame();
  const phase = ((frame + 40) % 240) / 240;
  const blue = "hsl(var(--primary))";
  const x = interpolate(
    phase,
    [0, 0.16, 0.36, 0.52, 0.72, 0.92, 1],
    [8, 8, 92, 92, 176, 176, 176],
  );
  const opacity = interpolate(phase, [0, 0.06, 0.92, 1], [0, 1, 1, 0]);
  return (
    <svg
      x={14}
      y={54}
      width={width - 28}
      height={126}
      viewBox="0 0 260 126"
      data-workday-scene="planning"
    >
      {[0, 1, 2].map((column) => (
        <g key={column}>
          <rect
            x={column * 84 + 3}
            y={3}
            width={78}
            height={100}
            rx={7}
            fill={blue}
            fillOpacity={0.035}
          />
          <circle
            cx={column * 84 + 15}
            cy={15}
            r={3}
            fill={blue}
            opacity={0.2 + column * 0.2}
          />
          <rect
            x={column * 84 + 24}
            y={13}
            width={43}
            height={4}
            rx={2}
            fill={blue}
            opacity={0.25}
          />
          {[0, 1].map((task) => (
            <g key={task}>
              <rect
                x={column * 84 + 9}
                y={task * 27 + 43}
                width={65}
                height={22}
                rx={5}
                fill="hsl(var(--card))"
                stroke={blue}
                strokeOpacity={0.1}
              />
              <rect
                x={column * 84 + 17}
                y={task * 27 + 50}
                width={38}
                height={3}
                rx={1.5}
                fill={blue}
                opacity={0.1}
              />
            </g>
          ))}
        </g>
      ))}
      <g transform={`translate(${x}, 31)`} opacity={opacity}>
        <rect
          width={67}
          height={34}
          rx={6}
          fill="hsl(var(--card))"
          stroke={blue}
          strokeOpacity={0.6}
        />
        <rect
          x={8}
          y={8}
          width={43}
          height={4}
          rx={2}
          fill={blue}
          opacity={0.5}
        />
        {[0, 1, 2].map((member) => (
          <circle
            key={member}
            cx={12 + member * 9}
            cy={24}
            r={4}
            fill={blue}
            opacity={0.2 + member * 0.15}
          />
        ))}
        <path
          d="M49 23 l3 3 6-7"
          fill="none"
          stroke={blue}
          strokeWidth={1.5}
          opacity={phase > 0.72 ? 0.8 : 0}
        />
      </g>
      <path
        d="M12 116 H242"
        stroke={blue}
        strokeOpacity={0.12}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d="M12 116 H242"
        stroke={blue}
        strokeOpacity={0.5}
        strokeWidth={3}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${phase * 100} 100`}
        opacity={opacity}
      />
      <path d="M81 108 v16 M165 108 v16" stroke={blue} strokeOpacity={0.15} />
    </svg>
  );
}
