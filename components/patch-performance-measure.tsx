"use client";

// A third-party lib calls performance.measure() with a nonexistent mark and throws.
// Patched at module scope so it runs before hydration, without a <script> tag (React 19 warns).
if (typeof window !== "undefined") {
  const original = performance.measure.bind(performance);
  performance.measure = (...args: Parameters<typeof performance.measure>) => {
    try {
      return original(...args);
    } catch {
      return undefined as unknown as PerformanceMeasure;
    }
  };
}

export function PatchPerformanceMeasure() {
  return null;
}
