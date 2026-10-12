import { FileText, Layers3, Package, Users2 } from "lucide-react";

export function WorkspaceArtwork({ frame = 0 }: { frame?: number }) {
  const phase = (frame / 360) * Math.PI * 2;
  const float = (offset: number) => Math.sin(phase + offset) * 5;
  return (
    <div className="dashboard-art-scene">
      <span className="dashboard-art-ring" />
      <span className="dashboard-art-ring dashboard-art-ring-outer" />
      <span
        className="dashboard-art-orbit"
        style={{ transform: `rotate(${frame}deg)` }}
      >
        <i />
      </span>
      <span
        className="dashboard-art-orbit dashboard-art-orbit-inner"
        style={{ transform: `rotate(${-frame + 130}deg)` }}
      >
        <i />
      </span>
      <svg className="dashboard-art-flow" viewBox="0 0 310 194">
        <path
          d="M45 49 Q76 19 130 65 M268 87 Q246 44 213 71 M52 157 Q98 185 143 125"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 9"
          strokeDashoffset={-frame / 3}
        />
        {[0, 1, 2].map((index) => (
          <circle
            key={index}
            cx={156 + Math.cos(phase + index * 2.1) * 115}
            cy={97 + Math.sin(phase + index * 2.1) * 74}
            r="2"
            fill="#c3ddff"
            opacity=".85"
          />
        ))}
      </svg>
      {Array.from({ length: 7 }, (_, index) => (
        <span
          key={index}
          className="dashboard-art-spark"
          style={{
            left: 12 + ((index * 47) % 282),
            top: 10 + ((index * 31) % 168),
            opacity: 0.15 + (Math.sin(phase + index) + 1) * 0.3,
            transform: `translateY(${float(index)}px) scale(${0.8 + Math.sin(phase + index) * 0.2})`,
          }}
        />
      ))}
      <span className="dashboard-art-connector" />
      <div
        className="dashboard-art-board"
        style={{
          transform: `translateY(${float(0)}px) rotate(${-7 + Math.sin(phase) * 2}deg)`,
        }}
      >
        <span
          className="dashboard-art-shine"
          style={{
            transform: `translateX(${(frame / 360) * 290 - 95}px) rotate(20deg)`,
            opacity: Math.sin(phase / 2) ** 4,
          }}
        />
        <div className="dashboard-art-top">
          <i />
          <i />
          <i />
        </div>
        <div className="dashboard-art-board-body">
          <span className="dashboard-art-tile">
            <Package />
          </span>
          <div>
            <span className="dashboard-art-line" />
            <span className="dashboard-art-line short" />
          </div>
        </div>
        <div className="dashboard-art-columns">
          {[0, 1, 2].map((index) => (
            <span key={index}>
              <i
                style={{
                  width: `${45 + (Math.sin(phase + index * 1.2) + 1) * 24}%`,
                }}
              />
            </span>
          ))}
        </div>
      </div>
      <span
        className="dashboard-art-node dashboard-art-node-one"
        style={{
          transform: `translateY(${float(1)}px) rotate(${-10 + Math.sin(phase) * 4}deg)`,
        }}
      >
        <FileText />
      </span>
      <span
        className="dashboard-art-node dashboard-art-node-two"
        style={{
          transform: `translateY(${float(2.4)}px) rotate(${9 + Math.sin(phase + 1) * 4}deg)`,
        }}
      >
        <Users2 />
      </span>
      <span
        className="dashboard-art-node dashboard-art-node-three"
        style={{
          transform: `translateY(${float(4)}px) rotate(${7 + Math.sin(phase + 2) * 4}deg)`,
        }}
      >
        <Layers3 />
      </span>
    </div>
  );
}
