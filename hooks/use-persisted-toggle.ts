"use client";

import { useEffect, useState } from "react";

// Persists a boolean to localStorage under `key`, surviving unmount/reload instead of resetting to `defaultValue`.
// Drop-in replacement for `useState<boolean>`.
export function usePersistedToggle(
  key: string,
  defaultValue: boolean
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored === "true" || stored === "false") {
      setValue(stored === "true");
    }
  }, [key]);

  function set(next: boolean | ((prev: boolean) => boolean)) {
    setValue((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      localStorage.setItem(key, String(resolved));
      return resolved;
    });
  }

  return [value, set];
}
