"use client";

import { useState } from "react";
import { reportDeliveryLabel } from "@/lib/reports/delivery";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

export function ReportWeekLabel({ weekStart }: { weekStart: string }) {
  return <p className="text-sm font-medium">{reportDeliveryLabel(weekStart)}</p>;
}

export function PrepareReportButtons({
  weekStart,
  unitNumber,
  showAll = false,
}: {
  weekStart: string;
  unitNumber?: string;
  showAll?: boolean;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<"one" | "all" | null>(null);

  async function download(unit?: string) {
    setPending(unit ? "one" : "all");
    try {
      const params = new URLSearchParams({ week: weekStart });
      if (unit) params.set("unit", unit);
      const response = await fetch(`/api/statements/pdf?${params.toString()}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/pdf")) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast(body?.error ?? "Could not build the PDF.", "error");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = unit ? `tret-truck-${unit}-${weekStart}.pdf` : `tret-monday-reports-${weekStart}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast(unit ? `Report ready for truck ${unit}` : "Monday reports ready", "success");
    } catch {
      toast("Could not build the PDF.", "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {unitNumber ? (
        <Button type="button" variant="vivid" disabled={pending !== null} onClick={() => download(unitNumber)}>
          {pending === "one" ? "Preparing report..." : "Prepare report"}
        </Button>
      ) : null}
      {showAll ? (
        <Button type="button" variant="vividAlt" disabled={pending !== null} onClick={() => download()}>
          {pending === "all" ? "Preparing reports..." : "Prepare Monday reports"}
        </Button>
      ) : null}
    </div>
  );
}
