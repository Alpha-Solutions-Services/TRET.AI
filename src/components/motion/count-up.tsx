"use client";

import { useEffect, useRef, useState } from "react";

/**
 * React Vibe count-up (eased, about 1.1s). The first paint is the final text
 * so the server and the browser match. Motion starts after mount, and skips
 * when the user asks for less motion.
 */
export function CountUp({
  text,
  target,
  format,
}: {
  text: string;
  target: number | null;
  format: (value: number) => string;
}) {
  const [shown, setShown] = useState(text);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    setShown(text);
    if (target == null) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 1100, 1);
      if (t >= 1) {
        setShown(text);
        return;
      }
      const eased = 1 - (1 - t) ** 3;
      setShown(formatRef.current(Math.round(eased * target)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, target]);

  return <span className="num">{shown}</span>;
}
