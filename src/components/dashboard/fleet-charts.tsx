"use client";

import { AreaChart, BarChart, ChartCard, DonutChart, type ChartSeries } from "@/components/charts/charts";
import { categoryColor } from "@/lib/charts/palette";
import { fleetInsOutsTotals, fleetWeekTrend, type TruckWeekInsOuts } from "@/lib/sheets/ins-outs";

const SHEET_SERIES: ChartSeries[] = [
  { key: "ins", label: "Ins", color: categoryColor(0) },
  { key: "outs", label: "Outs", color: categoryColor(1) },
];

export function FleetCharts({ rows }: { rows: TruckWeekInsOuts[] }) {
  const readable = rows.filter((row) => row.readable);
  const bars = readable.map((row) => ({
    label: row.unitNumber,
    values: { ins: row.insCents, outs: row.outsCents },
  }));
  const trend = fleetWeekTrend(rows).map((week) => ({
    label: week.weekStart,
    values: { ins: week.insCents, outs: week.outsCents },
  }));
  const slices = fleetInsOutsTotals(rows)
    .categories.filter((row) => row.cents > 0)
    .map((row) => ({ label: row.category, cents: row.cents }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Ins and outs by truck">
        <BarChart rows={bars} series={SHEET_SERIES} empty="No readable truck sheets for this week." />
      </ChartCard>
      <ChartCard title="Eight week trend">
        <AreaChart
          rows={trend}
          series={SHEET_SERIES}
          empty="No sheet money in the last eight weeks."
        />
      </ChartCard>
      <ChartCard title="Sheet expense mix">
        <DonutChart slices={slices} empty="No sheet expenses for this week." />
      </ChartCard>
    </div>
  );
}
