"use client";

import { motion, useReducedMotion } from "framer-motion";

const SCALES = [0.45, 0.72, 0.55, 0.9, 0.62, 0.8, 0.48, 0.7, 0.58, 0.84, 0.5];

/** React Vibe Waveform, adapted. MIT. https://reactvibe.com/docs/components/waveform */
export function Waveform({ label = "Working", tone = "warn" }: { label?: string; tone?: "ok" | "warn" | "danger" }) {
  const reduced = useReducedMotion();
  const color = tone === "ok" ? "var(--color-ok)" : tone === "danger" ? "var(--color-danger)" : "var(--color-warn)";
  return (
    <div className="flex h-16 items-end justify-center gap-1.5 pb-3" role="status" aria-label={label}>
      {SCALES.map((scale, index) => (
        <motion.span
          key={index}
          className="rv-bar block w-1.5 origin-bottom rounded-full"
          style={{ height: 28, background: color }}
          initial={false}
          animate={reduced ? { scaleY: 0.65 } : { scaleY: [scale, 1, scale] }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: index * 0.08 }
          }
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
