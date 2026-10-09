"use client";

import { motion, useReducedMotion } from "framer-motion";

/** React Vibe style metric card. Real numbers only. Motion stops when the user asks for less motion. */
export function KpiCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  color: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="material border border-[var(--color-border)] px-6 py-5"
      style={{ boxShadow: `inset 4px 0 0 ${color}` }}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <p className="text-xs tracking-wide text-[var(--color-fg-muted)]">{label}</p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{detail}</p> : null}
    </motion.div>
  );
}
