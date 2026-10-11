"use client";

const STEPS = ["Parse", "Match", "Review", "Sheets"] as const;

/** Import steps. Labels stay inside the drawing. No decorative dots. */
export function Pipeline({ pending = false }: { pending?: boolean }) {
  const path = "M 70 28 H 610";
  return (
    <section className="rounded-xl border border-[var(--color-border)] px-4 py-4" aria-label="Import steps">
      <h2 className="mb-2 text-sm font-medium">Import steps</h2>
      <div className="w-full">
        <svg viewBox="0 0 680 112" className="h-auto w-full" role="img" aria-label="Parse, match, review, then sheets">
          <path d={path} stroke="var(--color-fg)" strokeWidth="1.25" fill="none" opacity={pending ? 1 : 0.85} />
          {STEPS.map((step, index) => {
            const x = 70 + index * 180;
            return (
              <g key={step}>
                <rect x={x - 58} y={52} width="116" height="40" rx="12" fill="var(--color-field)" stroke="var(--color-border)" />
                <text x={x} y={77} textAnchor="middle" fill="var(--color-fg)" fontSize="14">
                  {step}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
