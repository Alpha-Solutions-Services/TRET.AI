import { expenseMonthLabel, type ManagementCardSummary } from "@/lib/legacy/summary";
import { centsToDollarString } from "@/lib/money/cents";

function money(cents: number): string {
  if (cents < 0) return `-$${centsToDollarString(-cents)}`;
  return `$${centsToDollarString(cents)}`;
}

export function managementSummaryCopy(summary: ManagementCardSummary): string {
  const month = expenseMonthLabel(summary.expenseMonth);
  return `Income is the management fee on this week's sheet loads. Expenses are Legacy company costs dated in ${month}. The card shows the whole month, because those costs are entered by month. Tolson payable is the sum of each truck setting for this week and counts as an expense. A blank setting is $0. Net is income minus portal expenses minus Tolson payable. Legacy kept is income minus Tolson payable.`;
}

export function ManagementCards({ summary }: { summary: ManagementCardSummary }) {
  const cards = [
    { label: "Income", cents: summary.incomeCents },
    { label: "Expenses", cents: summary.expenseCents },
    { label: "Net", cents: summary.netCents },
    { label: "Tolson payable", cents: summary.tolsonPayableCents },
  ];
  return (
    <section className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="material rounded-xl border border-[var(--color-border)] px-4 py-3">
            <p className="text-xs text-[var(--color-fg-muted)]">{card.label}</p>
            <p className="mt-1 text-lg font-semibold">{money(card.cents)}</p>
          </div>
        ))}
      </div>
      <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">{managementSummaryCopy(summary)}</p>
    </section>
  );
}

export function ManagementSummaryTable({ summary }: { summary: ManagementCardSummary }) {
  const lines: Array<{ label: string; cents: number; strong?: boolean }> = [
    { label: "Income (management fees this week)", cents: summary.incomeCents, strong: true },
    { label: "Expenses (portal costs this month)", cents: summary.expenseCents, strong: true },
    { label: "Tolson payable", cents: summary.tolsonPayableCents, strong: true },
    { label: "Net", cents: summary.netCents, strong: true },
    { label: "Legacy kept", cents: summary.legacyKeptCents },
  ];
  return (
    <section className="space-y-2">
      <div className="material overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <caption className="px-3 py-3 text-left font-medium">Management P&L</caption>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-3 font-medium">Line</th>
              <th className="px-3 py-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.label}
                className={
                  line.strong
                    ? "border-b border-[var(--color-border)] bg-[var(--color-muted)] font-medium"
                    : "border-b border-[var(--color-border)]"
                }
              >
                <td className="px-3 py-2">{line.label}</td>
                <td className="px-3 py-2">{money(line.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">{managementSummaryCopy(summary)}</p>
    </section>
  );
}
