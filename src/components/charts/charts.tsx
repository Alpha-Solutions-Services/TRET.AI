"use client";

import { categoryColor, percentOf } from "@/lib/charts/palette";
import { formatStatementDollars } from "@/lib/reports/format";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
};

export type ChartRow = {
  label: string;
  values: Record<string, number>;
};

function money(cents: number): string {
  return formatStatementDollars(cents);
}

export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="material border border-[var(--color-border)] p-6">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BarChart({
  rows,
  series,
  empty,
}: {
  rows: ChartRow[];
  series: ChartSeries[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)));
  if (rows.length === 0 || rows.every((row) => series.every((item) => (row.values[item.key] ?? 0) === 0))) {
    return <p className="text-sm text-[var(--color-fg-muted)]">{empty}</p>;
  }
  const width = 640;
  const height = 200;
  const pad = 28;
  const group = (width - pad * 2) / rows.length;
  const bar = Math.min(18, (group - 8) / series.length);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart" className="h-52 w-full">
        {rows.map((row, rowIndex) =>
          series.map((item, seriesIndex) => {
            const value = row.values[item.key] ?? 0;
            const barHeight = (value / max) * (height - 48);
            const x = pad + rowIndex * group + 4 + seriesIndex * bar;
            const y = height - 28 - barHeight;
            return (
              <rect
                key={`${row.label}-${item.key}`}
                x={x}
                y={y}
                width={bar - 2}
                height={barHeight}
                rx={3}
                fill={item.color}
              >
                <title>{`${row.label} ${item.label} ${money(value)}`}</title>
              </rect>
            );
          }),
        )}
        {rows.map((row, rowIndex) => (
          <text
            key={row.label}
            x={pad + rowIndex * group + group / 2}
            y={height - 8}
            textAnchor="middle"
            className="fill-[var(--color-fg-muted)] text-[11px]"
          >
            {row.label}
          </text>
        ))}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

export function AreaChart({
  rows,
  series,
  empty,
}: {
  rows: ChartRow[];
  series: ChartSeries[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)));
  if (rows.length === 0 || rows.every((row) => series.every((item) => (row.values[item.key] ?? 0) === 0))) {
    return <p className="text-sm text-[var(--color-fg-muted)]">{empty}</p>;
  }
  const width = 640;
  const height = 200;
  const pad = 16;
  const step = rows.length === 1 ? 0 : (width - pad * 2) / (rows.length - 1);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Area chart" className="h-52 w-full">
        {series.map((item) => {
          const coords = rows.map((row, index) => {
            const value = row.values[item.key] ?? 0;
            const x = pad + index * step;
            const y = height - 28 - (value / max) * (height - 48);
            return { x, y, value, label: row.label };
          });
          const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
          const area = `${coords[0]?.x ?? pad},${height - 28} ${line} ${coords.at(-1)?.x ?? pad},${height - 28}`;
          return (
            <g key={item.key}>
              <polygon points={area} fill={item.color} opacity={0.18} />
              <polyline points={line} fill="none" stroke={item.color} strokeWidth={2} />
              {coords.map((point) => (
                <circle key={`${item.key}-${point.label}`} cx={point.x} cy={point.y} r={3} fill={item.color}>
                  <title>{`${point.label} ${item.label} ${money(point.value)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {rows.map((row, index) => (
          <text
            key={row.label}
            x={pad + index * step}
            y={height - 8}
            textAnchor="middle"
            className="fill-[var(--color-fg-muted)] text-[11px]"
          >
            {row.label.slice(5)}
          </text>
        ))}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

export function DonutChart({
  slices,
  empty,
}: {
  slices: Array<{ label: string; cents: number }>;
  empty: string;
}) {
  const parts = slices
    .filter((slice) => slice.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  const total = parts.reduce((sum, slice) => sum + slice.cents, 0);
  if (total === 0) return <p className="text-sm text-[var(--color-fg-muted)]">{empty}</p>;
  let angle = -Math.PI / 2;
  const cx = 90;
  const cy = 90;
  const radius = 70;
  const inner = 42;

  return (
    <figure className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 180 180" role="img" aria-label="Expense mix" className="h-40 w-40">
        {parts.length === 1 ? (
          <path d={fullRing(cx, cy, radius, inner)} fill={categoryColor(0)} fillRule="evenodd">
            <title>{`${parts[0]?.label ?? ""} ${money(parts[0]?.cents ?? 0)}`}</title>
          </path>
        ) : (
          parts.map((slice, index) => {
            const sweep = (slice.cents / total) * Math.PI * 2;
            const path = donutSlice(cx, cy, radius, inner, angle, angle + sweep);
            angle += sweep;
            return (
              <path key={slice.label} d={path} fill={categoryColor(index)}>
                <title>{`${slice.label} ${money(slice.cents)}`}</title>
              </path>
            );
          })
        )}
      </svg>
      <ul className="space-y-1 text-sm">
        {parts.map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: categoryColor(index) }}
            />
            <span>
              {slice.label} {money(slice.cents)} {percentOf(slice.cents, total)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-fg-muted)]">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function fullRing(cx: number, cy: number, outer: number, inner: number): string {
  return [
    `M ${cx - outer} ${cy}`,
    `A ${outer} ${outer} 0 1 1 ${cx + outer} ${cy}`,
    `A ${outer} ${outer} 0 1 1 ${cx - outer} ${cy}`,
    `M ${cx - inner} ${cy}`,
    `A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy}`,
    `A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy}`,
    "Z",
  ].join(" ");
}

function donutSlice(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const large = end - start > Math.PI ? 1 : 0;
  const outerStart = point(cx, cy, outer, start);
  const outerEnd = point(cx, cy, outer, end);
  const innerStart = point(cx, cy, inner, start);
  const innerEnd = point(cx, cy, inner, end);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function point(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}
