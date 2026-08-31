/**
 * Single source of truth for select/status option colours. These are *data* colours
 * (stay red across themes, only fill/text polarity flips) so they live outside the
 * token system; every pair is measured to clear 4.5:1 (badge text) / 3:1 (dots).
 */

export type OptionColorKey =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink";

export interface OptionStyle {
  /** Pill carrying the option label. */
  badge: string;
  /** Small round swatch beside the option label. */
  dot: string;
  /** Board-column header strip: tinted surface + matching edge. */
  header: string;
}

export const OPTION_STYLES: Record<OptionColorKey, OptionStyle> = {
  gray: {
    dot: "bg-[#71717a] dark:bg-[#a1a1aa]",
    badge: "bg-[#d4d4d8] text-[#3f3f46] dark:bg-[#3f3f46] dark:text-[#e4e4e7]",
    header:
      "bg-[#f4f4f5] border-[#d4d4d8] dark:bg-[#1c1f26] dark:border-[#33363e]",
  },
  red: {
    dot: "bg-[#f87171]",
    badge: "bg-[#fee2e2] text-[#b91c1c] dark:bg-[#7f1d1d] dark:text-[#fecaca]",
    header:
      "bg-[#fff5f5] border-[#fecaca] dark:bg-[#2a1618] dark:border-[#4a2225]",
  },
  orange: {
    dot: "bg-[#fb923c]",
    badge: "bg-[#ffedd5] text-[#c2410c] dark:bg-[#7c2d12] dark:text-[#fed7aa]",
    header:
      "bg-[#fff8f0] border-[#fed7aa] dark:bg-[#2a1d12] dark:border-[#4a3320]",
  },
  yellow: {
    dot: "bg-[#facc15]",
    badge: "bg-[#fef9c3] text-[#a16207] dark:bg-[#713f12] dark:text-[#fde68a]",
    header:
      "bg-[#fffdf0] border-[#fde68a] dark:bg-[#28220f] dark:border-[#473c1b]",
  },
  green: {
    dot: "bg-[#4ade80]",
    badge: "bg-[#dcfce7] text-[#15803d] dark:bg-[#14532d] dark:text-[#bbf7d0]",
    header:
      "bg-[#f0fdf4] border-[#bbf7d0] dark:bg-[#12261a] dark:border-[#20422c]",
  },
  teal: {
    dot: "bg-[#2dd4bf]",
    badge: "bg-[#ccfbf1] text-[#0f766e] dark:bg-[#134e4a] dark:text-[#99f6e4]",
    header:
      "bg-[#f0fdfa] border-[#99f6e4] dark:bg-[#0f2624] dark:border-[#1b423e]",
  },
  blue: {
    dot: "bg-[#38bdf8]",
    badge: "bg-[#e0f2fe] text-[#0369a1] dark:bg-[#0c4a6e] dark:text-[#bae6fd]",
    header:
      "bg-[#f0f9ff] border-[#bae6fd] dark:bg-[#122334] dark:border-[#1f3c56]",
  },
  purple: {
    dot: "bg-[#a78bfa]",
    badge: "bg-[#ede9fe] text-[#6d28d9] dark:bg-[#4c1d95] dark:text-[#ddd6fe]",
    header:
      "bg-[#f5f3ff] border-[#ddd6fe] dark:bg-[#1f1833] dark:border-[#362a55]",
  },
  pink: {
    dot: "bg-[#f472b6]",
    badge: "bg-[#fce7f3] text-[#be185d] dark:bg-[#831843] dark:text-[#fbcfe8]",
    header:
      "bg-[#fdf4ff] border-[#f5d0fe] dark:bg-[#2a1424] dark:border-[#4a2440]",
  },
};

/** Fallback for an option whose colour is unset or unrecognised. */
export const DEFAULT_OPTION_STYLE: OptionStyle = OPTION_STYLES.gray;

/** Resolve a possibly-unknown colour name coming from stored data. */
export function optionStyle(color: string | null | undefined): OptionStyle {
  return OPTION_STYLES[color as OptionColorKey] ?? DEFAULT_OPTION_STYLE;
}
