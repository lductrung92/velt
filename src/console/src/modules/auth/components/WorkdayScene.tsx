import type { ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type WorkdayLabels = {
  plan: string;
  idea: string;
  build: string;
  launch: string;
};

import { IdeaScene } from "./workday-scenes/IdeaScene";
import { PlanningScene } from "./workday-scenes/PlanningScene";
import { BuildScene } from "./workday-scenes/BuildScene";
import { LaunchScene } from "./workday-scenes/LaunchScene";

const blue = "hsl(var(--primary))";
const ink = "hsl(var(--muted-foreground))";

// Everything is driven by the same 24-second timeline, including the loop seam.
export function WorkdayScene({ labels }: { labels: WorkdayLabels }) {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const angle = (frame / durationInFrames) * Math.PI * 2;
  const compact = width < 1000;
  const panelWidth = compact ? 224 : Math.min(288, width * 0.215);
  const panelHeight = 194;
  const inset = Math.max(24, width * 0.045);
  const left = compact ? -24 : inset;
  const right = compact ? width - panelWidth + 24 : width - panelWidth - inset;
  const top = compact ? 26 : Math.max(48, height * 0.12);
  const bottom = compact
    ? height - panelHeight - 26
    : height - panelHeight - top;
  const pulse = (stage: number) =>
    (1 + Math.cos(angle - stage * (Math.PI / 2))) / 2;
  const compactFade = (offset: number) => {
    const position = (frame + offset) % 360;
    return Math.min(1, position / 20, (360 - position) / 20);
  };

  function panel(
    x: number,
    y: number,
    stage: number,
    label: string,
    content: ReactNode,
  ) {
    return (
      <g
        transform={`translate(${x + Math.cos(angle * 2 + stage) * 4}, ${y + Math.sin(angle * 2 + stage) * 9})`}
        opacity={0.6 + pulse(stage) * 0.25}
      >
        <rect
          width={panelWidth}
          height={panelHeight}
          rx={18}
          fill="hsl(var(--card) / 0.75)"
          stroke="hsl(var(--primary) / 0.16)"
        />
        <circle cx={22} cy={25} r={4} fill={blue} opacity={0.5} />
        <circle
          cx={22}
          cy={25}
          r={7 + pulse(stage) * 5}
          fill="none"
          stroke={blue}
          strokeOpacity={0.15 + pulse(stage) * 0.15}
        />
        <text x={35} y={29} fill={ink} fontSize={11} fontWeight={600}>
          {label}
        </text>
        <path
          d={`M16 44 H${panelWidth - 16}`}
          stroke="hsl(var(--primary) / 0.09)"
        />
        {content}
      </g>
    );
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <filter id="workday-soft-mask">
          <feGaussianBlur stdDeviation={compact ? 24 : 40} />
        </filter>
        <mask id="workday-clear-center">
          <rect width={width} height={height} fill="white" />
          <rect
            x={width / 2 - (compact ? width / 2 - 12 : 270)}
            y={height / 2 - 245}
            width={compact ? width - 24 : 540}
            height={490}
            rx={100}
            fill="black"
            filter="url(#workday-soft-mask)"
          />
        </mask>
      </defs>
      <g mask="url(#workday-clear-center)">
        <g data-workday-effect="particles" fill={blue}>
          {Array.from({ length: compact ? 12 : 32 }, (_, index) => {
            const x =
              width * (index % 2 ? 0.83 : 0.17) +
              Math.sin(angle + index * 2.4) * width * 0.12;
            const y =
              height * ((index * 0.137 + 0.06) % 1) +
              Math.cos(angle * 2 + index) * 24;
            return (
              <g key={index}>
                <circle
                  cx={x}
                  cy={y}
                  r={index % 3 === 0 ? 3 : 1.5}
                  opacity={0.12 + pulse(index * 0.2) * 0.18}
                />
                {index % 4 === 0 && (
                  <circle
                    cx={x}
                    cy={y}
                    r={8 + pulse(index) * 12}
                    fill="none"
                    stroke={blue}
                    strokeWidth={0.8}
                    opacity={0.1 + pulse(index) * 0.1}
                  />
                )}
              </g>
            );
          })}
        </g>
        <g
          data-workday-effect="orbits"
          fill="none"
          stroke={blue}
          strokeWidth={1}
        >
          {[0, 1].map((orbit) => (
            <g
              key={orbit}
              transform={`translate(${width * (orbit ? 0.9 : 0.1)}, ${height * (orbit ? 0.82 : 0.18)}) rotate(${(frame / durationInFrames) * 360 * (orbit ? -1 : 1)})`}
              opacity={0.14}
            >
              <circle r={compact ? 68 : 120} strokeDasharray="2 10" />
              <circle
                r={compact ? 86 : 145}
                strokeDasharray="70 35 4 35"
                strokeWidth={1.5}
              />
            </g>
          ))}
        </g>
        {!compact && (
          <g
            data-workday-effect="team"
            transform={`translate(${width / 2 - 64}, ${Math.max(40, height * 0.085)})`}
          >
            <path d="M0 0 H128" stroke={blue} strokeOpacity={0.12} />
            {[0, 1, 2, 3, 4].map((member) => (
              <g
                key={member}
                transform={`translate(${member * 32}, ${Math.sin(angle * 2 + member * 0.7) * 4})`}
              >
                <circle
                  r={13 + pulse(member * 0.2) * 3}
                  fill="hsl(var(--card) / 0.8)"
                  stroke={blue}
                  strokeOpacity={0.2}
                />
                <circle cy={-3} r={3.4} fill={blue} opacity={0.35} />
                <path
                  d="M-6 6 Q0-1 6 6"
                  fill="none"
                  stroke={blue}
                  strokeWidth={2}
                  opacity={0.35}
                />
              </g>
            ))}
          </g>
        )}
        {!compact && (
          <g fill="none" stroke={blue}>
            <rect
              x={inset + panelWidth / 2}
              y={top + panelHeight / 2}
              width={width - 2 * inset - panelWidth}
              height={bottom - top}
              rx={100}
              opacity={0.1}
              strokeWidth={1}
            />
            <rect
              x={inset + panelWidth / 2}
              y={top + panelHeight / 2}
              width={width - 2 * inset - panelWidth}
              height={bottom - top}
              rx={100}
              opacity={0.35}
              strokeWidth={2}
              strokeDasharray="8 52"
              strokeDashoffset={-frame}
              pathLength={360}
            />
          </g>
        )}
        {!compact && (
          <g data-workday-effect="data-flow" fill={blue}>
            {Array.from({ length: 8 }, (_, index) => {
              const orbit = angle + (index * Math.PI) / 4;
              const x = width / 2 + Math.cos(orbit) * width * 0.39;
              const y = height / 2 + Math.sin(orbit) * height * 0.38;
              return (
                <g key={index} opacity={0.3}>
                  <circle cx={x} cy={y} r={4} />
                  <circle cx={x} cy={y} r={10} opacity={0.12} />
                </g>
              );
            })}
          </g>
        )}
        {compact ? (
          <g opacity={compactFade(0)}>
            {frame < 360
              ? panel(
                  left,
                  top,
                  0,
                  labels.idea,
                  <IdeaScene width={panelWidth} />,
                )
              : panel(
                  left,
                  top,
                  1,
                  labels.plan,
                  <PlanningScene width={panelWidth} />,
                )}
          </g>
        ) : (
          panel(left, top, 0, labels.idea, <IdeaScene width={panelWidth} />)
        )}
        {!compact &&
          panel(
            right,
            top + 24,
            1,
            labels.plan,
            <PlanningScene width={panelWidth} />,
          )}
        {!compact &&
          panel(
            left + 14,
            bottom,
            2,
            labels.build,
            <BuildScene width={panelWidth} />,
          )}
        {compact ? (
          <g opacity={compactFade(180)}>
            {(frame + 180) % 720 < 360
              ? panel(
                  right,
                  bottom,
                  2,
                  labels.build,
                  <BuildScene width={panelWidth} />,
                )
              : panel(
                  right,
                  bottom,
                  3,
                  labels.launch,
                  <LaunchScene width={panelWidth} />,
                )}
          </g>
        ) : (
          panel(
            right - 14,
            bottom - 24,
            3,
            labels.launch,
            <LaunchScene width={panelWidth} />,
          )
        )}
      </g>
    </svg>
  );
}
