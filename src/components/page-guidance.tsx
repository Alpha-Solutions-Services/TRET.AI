"use client";

import { useEffect, useState } from "react";

let current = "";
const listeners = new Set<(value: string) => void>();

function publish(value: string) {
  current = value;
  for (const listener of listeners) listener(value);
}

export function usePageGuidance(): string {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue(current);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Puts the current page instruction into the footer tray. */
export function PageGuidance({ text }: { text: string }) {
  useEffect(() => {
    publish(text);
    return () => {
      if (current === text) publish("");
    };
  }, [text]);
  return null;
}
