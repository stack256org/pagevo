// Windows' emoji font shows flag emoji as raw letter pairs instead of colored
// flags, so we render the flag-icons SVG set instead; flagIconCode maps an
// emoji to its `fi-<code>`, or null if it isn't a flag.

const REGIONAL_INDICATOR_BASE = 0x1_f1_e6;

// The three ISO 3166-2 "subdivision" flags (England/Scotland/Wales) use tag
// sequences rather than regional-indicator pairs, so they need an explicit map.
const SUBDIVISION_FLAG_CODES: Record<string, string> = {
  "🏴󠁧󠁢󠁥󠁮󠁧󠁿": "gb-eng",
  "🏴󠁧󠁢󠁳󠁣󠁴󠁿": "gb-sct",
  "🏴󠁧󠁢󠁷󠁬󠁳󠁿": "gb-wls",
};

export function flagIconCode(emoji: string): string | null {
  if (SUBDIVISION_FLAG_CODES[emoji]) {
    return SUBDIVISION_FLAG_CODES[emoji];
  }
  const points = [...emoji];
  if (points.length !== 2) {
    return null;
  }
  let code = "";
  for (const ch of points) {
    const cp = ch.codePointAt(0)!;
    if (cp < REGIONAL_INDICATOR_BASE || cp > REGIONAL_INDICATOR_BASE + 25) {
      return null;
    }
    code += String.fromCharCode(cp - REGIONAL_INDICATOR_BASE + 65);
  }
  return code.toLowerCase();
}
