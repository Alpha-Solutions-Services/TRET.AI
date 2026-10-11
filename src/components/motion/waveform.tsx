"use client";

import { motion, useReducedMotion } from "framer-motion";

const HEIGHTS = [8, 14, 10, 16, 12, 15, 9];

/** Shown only while a job is running. The label is visible. The bars move once. */
export function Waveform({ label }: { label: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex items-center gap-3" role="status">
      <span className="flex h-4 items-end gap-1" aria-hidden="true">
        {HEIGHTS.map((height, index) => (
          <motion.span
            key={index}
            className="block w-1 rounded-full bg-[var(--color-accent)]"
            style={{ height }}
            initial={{ scaleY: 0.4 }}
            animate={{ scaleY: reduced ? 1 : [0.4, 1, 0.7] }}
            transition={reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut", delay: index * 0.02 }}
          />
        ))}
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}
