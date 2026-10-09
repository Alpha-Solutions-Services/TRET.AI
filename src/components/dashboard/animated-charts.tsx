"use client";

import { useId } from "react";
import type { ChartRow, ChartSeries } from "@/components/charts/charts";
import { formatStatementDollars } from "@/lib/reports/format";

function money(cents: number): string {
  return formatStatementDollars(cents);
}

function isEmpty(rows: ChartRow[], series: ChartSeries[]): boolean {
  return rows.length === 0 || rows.every((row) => series.every((item) => (row.values[item.key] ?? 0) === 0));
}

/** Full width Ins and Outs bars. Adapted from the React Vibe comparative bar (MIT). */
export function AnimatedBarChart({
  rows,
  series,
  empty,
}: {
  rows: ChartRow[];
  series: ChartSeries[];
  empty: string;
}) {
  if (isEmpty(rows, series)) return <p className="text-sm text-[var(--color-fg-muted)]">{empty}</p>;
  const max = Math.max(1, ...rows.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)));
  const height = 320;
  const padX = 24;
  const padBottom = 36;
  const group = 120;
  const width = Math.max(720, padX * 2 + rows.length * group);
  const inner = 78;
  const bar = Math.max(28, inner / series.length - 6);

  return (
    <figure className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Ins and outs by truck"
        className="h-80 w-full"
        style={{ minWidth: Math.max(640, rows.length * 96) }}
      >
        {rows.map((row, rowIndex) =>
          series.map((item, seriesIndex) => {
            const value = row.values[item.key] ?? 0;
            const barHeight = Math.max(value > 0 ? 6 : 0, (value / max) * (height - 72));
            const x = padX + rowIndex * group + (group - inner) / 2 + seriesIndex * (bar + 6);
            const y = height - padBottom - barHeight;
            return (
              <rect
                key={`${row.label}-${item.key}`}
                className="rv-grow-y"
                x={x}
                y={y}
                width={bar}
                height={barHeight}
                rx={6}
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
            x={padX + rowIndex * group + group / 2}
            y={height - 12}
            textAnchor="middle"
            className="fill-[var(--color-fg)] text-[13px]"
          >
            {row.label}
          </text>
        ))}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

/** Eight week lines. Adapted from the React Vibe trend chart (MIT). */
export function AnimatedTrendChart({
  rows,
  series,
  empty,
}: {
  rows: ChartRow[];
  series: ChartSeries[];
  empty: string;
}) {
  const filterId = `trend-glow-${useId().replace(/:/g, "")}`;
  if (isEmpty(rows, series)) return <p className="text-sm text-[var(--color-fg-muted)]">{empty}</p>;
  const max = Math.max(1, ...rows.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)));
  const width = 960;
  const height = 280;
  const pad = 28;
  const step = rows.length === 1 ? 0 : (width - pad * 2) / (rows.length - 1);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Eight week trend" className="h-72 w-full">
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {series.map((item) => {
          const coords = rows.map((row, index) => {
            const value = row.values[item.key] ?? 0;
            const x = pad + index * step;
            const y = height - 36 - (value / max) * (height - 64);
            return { x, y, value, label: row.label };
          });
          const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
          const d = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
          const area = `${coords[0]?.x ?? pad},${height - 36} ${line} ${coords.at(-1)?.x ?? pad},${height - 36}`;
          return (
            <g key={item.key}>
              <polygon points={area} fill={item.color} opacity={0.16} />
              <path
                className="rv-draw"
                d={d}
                fill="none"
                stroke={item.color}
                strokeWidth={3}
                pathLength={1}
                filter={`url(#${filterId})`}
              />
              {coords.map((point) => (
                <circle key={`${item.key}-${point.label}`} cx={point.x} cy={point.y} r={4.5} fill={item.color}>
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
            y={height - 12}
            textAnchor="middle"
            className="fill-[var(--color-fg-muted)] text-[12px]"
          >
            {row.label.slice(5)}
          </text>
        ))}
      </svg>
      <Legend series={series} />
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
