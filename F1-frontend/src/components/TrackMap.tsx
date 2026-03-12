const VIEWBOX_W = 1000;
const VIEWBOX_H = 800;
const MARGIN = 50;

interface CarPosition {
  x: number;
  y: number;
  status: string;
}

interface TrackMapProps {
  circuitPoints: { x: number; y: number }[];
  livePositions: Record<string, CarPosition>;
  driverInfo: Record<string, { Tla: string; TeamColour: string }>;
}

function buildTransform(points: { x: number; y: number }[]) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scaleX = (VIEWBOX_W - 2 * MARGIN) / rangeX;
  const scaleY = (VIEWBOX_H - 2 * MARGIN) / rangeY;
  const scale = Math.min(scaleX, scaleY);

  // Centre the circuit within the viewBox
  const offsetX = MARGIN + ((VIEWBOX_W - 2 * MARGIN) - rangeX * scale) / 2;
  const offsetY = MARGIN + ((VIEWBOX_H - 2 * MARGIN) - rangeY * scale) / 2;

  return (x: number, y: number) => ({
    svgX: offsetX + (x - minX) * scale,
    svgY: VIEWBOX_H - (offsetY + (y - minY) * scale), // flip Y — SVG Y goes down
  });
}

export default function TrackMap({ circuitPoints, livePositions, driverInfo }: TrackMapProps) {
  if (circuitPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Loading circuit…
      </div>
    );
  }

  const toSvg = buildTransform(circuitPoints);

  const trackPoints = circuitPoints
    .map(p => {
      const { svgX, svgY } = toSvg(p.x, p.y);
      return `${svgX},${svgY}`;
    })
    .join(' ');

  const cars = Object.entries(livePositions).map(([num, pos]) => {
    const { svgX, svgY } = toSvg(pos.x, pos.y);
    const info = driverInfo[num];
    const color = info?.TeamColour ? `#${info.TeamColour}` : '#888';
    const tla = info?.Tla ?? num;
    const offTrack = pos.status === 'OffTrack';
    return { num, svgX, svgY, color, tla, offTrack };
  });

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className="w-full h-full"
      style={{ background: 'transparent' }}
    >
      {/* Track outline — two passes for a thick dark border + thin coloured line */}
      <polyline
        points={trackPoints}
        fill="none"
        stroke="#2a2a3e"
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={trackPoints}
        fill="none"
        stroke="#4a4a6a"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Car dots */}
      {cars.map(({ num, svgX, svgY, color, tla, offTrack }) => (
        <g key={num} opacity={offTrack ? 0.4 : 1}>
          {/* Outer ring */}
          <circle cx={svgX} cy={svgY} r={10} fill="#15151e" stroke={color} strokeWidth={2} />
          {/* Inner dot */}
          <circle cx={svgX} cy={svgY} r={6} fill={color} />
          {/* TLA label */}
          <text
            x={svgX}
            y={svgY - 14}
            textAnchor="middle"
            fontSize={11}
            fontWeight="bold"
            fontFamily="Titillium Web, sans-serif"
            fill={color}
            style={{ userSelect: 'none' }}
          >
            {tla}
          </text>
        </g>
      ))}
    </svg>
  );
}
