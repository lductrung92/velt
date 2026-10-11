import { useCurrentFrame } from "remotion";

export function IdeaScene({ width }: { width: number }) {
  const frame = useCurrentFrame();
  const angle = (frame / 240) * Math.PI * 2;
  const blue = "hsl(var(--primary))";
  return (
    <svg
      x={14}
      y={54}
      width={width - 28}
      height={126}
      viewBox="0 0 260 126"
      data-workday-scene="idea"
    >
      <defs>
        <radialGradient id="idea-light">
          <stop stopColor={blue} stopOpacity={0.18} />
          <stop offset="1" stopColor={blue} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle
        cx={130}
        cy={60}
        r={42 + Math.sin(angle) * 6}
        fill="url(#idea-light)"
      />
      {[
        { x: 24, y: 25 },
        { x: 236, y: 25 },
        { x: 24, y: 101 },
        { x: 236, y: 101 },
      ].map((note, index) => {
        const float = Math.sin(angle + index) * 4;
        return (
          <g key={index}>
            <path
              d={`M${note.x} ${note.y} Q130 ${note.y} 130 62`}
              fill="none"
              stroke={blue}
              strokeOpacity={0.17}
            />
            <path
              d={`M${note.x} ${note.y} Q130 ${note.y} 130 62`}
              fill="none"
              stroke={blue}
              strokeOpacity={0.6}
              strokeDasharray="6 46"
              strokeDashoffset={-frame * 0.65}
              pathLength={156}
            />
            <g transform={`translate(${note.x - 20}, ${note.y - 14 + float})`}>
              <rect
                width={40}
                height={28}
                rx={6}
                fill="hsl(var(--card))"
                stroke={blue}
                strokeOpacity={0.25}
              />
              <rect
                x={8}
                y={8}
                width={24}
                height={3}
                rx={1.5}
                fill={blue}
                opacity={0.35}
              />
              <rect
                x={8}
                y={16}
                width={16}
                height={3}
                rx={1.5}
                fill={blue}
                opacity={0.15}
              />
            </g>
          </g>
        );
      })}
      <g transform={`translate(130,62) scale(${1 + Math.sin(angle) * 0.05})`}>
        <circle
          r={30}
          fill="hsl(var(--card))"
          stroke={blue}
          strokeOpacity={0.25}
        />
        <path
          d="M-8 9 C-23-5-14-24 0-24 C16-24 24-5 8 9 L8 17 H-8 Z"
          fill={blue}
          fillOpacity={0.09}
          stroke={blue}
          strokeOpacity={0.7}
          strokeWidth={1.5}
        />
        <path
          d="M-7 22 H7 M-4 26 H4 M-3 15 V2 L-9-4 M3 15 V2 L9-4"
          fill="none"
          stroke={blue}
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
      {[0, 1, 2, 3, 4, 5].map((spark) => {
        const theta = angle + (spark * Math.PI) / 3;
        const radius = 39 + Math.sin(angle + spark) * 4;
        return (
          <path
            key={spark}
            d="M-3 0 H3 M0-3 V3"
            transform={`translate(${130 + Math.cos(theta) * radius}, ${62 + Math.sin(theta) * radius})`}
            stroke={blue}
            strokeWidth={1}
            opacity={0.25 + (1 + Math.sin(angle + spark)) * 0.15}
          />
        );
      })}
    </svg>
  );
}
