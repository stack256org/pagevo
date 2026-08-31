export const DEFAULT_PAGE_SIZE = 10;
export const MIN_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 100;

// Windowed page numbers with "…" gaps, e.g. for page 5 of 20: [1, "…", 4, 5, 6, "…", 20].
// Below 8 total pages just returns every number — matches small counts staying
// fully spelled out (no point collapsing 7 buttons into a window of 5).
export function getPageNumbers(
  current: number,
  total: number
): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      out.push("…");
    }
    out.push(sorted[i]!);
  }
  return out;
}
