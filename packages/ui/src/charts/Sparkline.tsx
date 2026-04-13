interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}

/**
 * Hand-rolled SVG sparkline. ~30 lines, zero deps, takes the queue card
 * "this is alive" sparkline pattern from Vercel project cards.
 */
export function Sparkline({
  points,
  width = 120,
  height = 28,
  stroke = "var(--signal)",
  fill,
  className,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg width={width} height={height} className={className}>
        <line
          x1={0}
          x2={width}
          y1={height - 2}
          y2={height - 2}
          stroke="var(--chart-gridline)"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const yFor = (v: number) => height - 2 - ((v - min) / span) * (height - 4);

  const linePath = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${yFor(v)}`)
    .join(" ");

  const areaPath = fill
    ? `${linePath} L ${(points.length - 1) * stepX} ${height} L 0 ${height} Z`
    : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      {areaPath && <path d={areaPath} fill={fill} stroke="none" />}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
