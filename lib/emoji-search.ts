import emojiKeywords from "emojilib";

const KEYWORDS = emojiKeywords as Record<string, string[]>;

// Strip variation selectors / skin-tone modifiers so a lookup still finds the
// base emoji's keywords even if the caller's glyph has a modifier applied.
function normalize(emoji: string): string {
  return emoji.replace(/[\u{FE0F}\u{1F3FB}-\u{1F3FF}]/gu, "");
}

function keywordsFor(emoji: string): string[] {
  return KEYWORDS[emoji] ?? KEYWORDS[normalize(emoji)] ?? [];
}

// True if `emoji` matches `query` — by keyword/name (e.g. "cat", "heart",
// "smile") or by literal glyph (pasting the emoji itself still works).
export function emojiMatches(emoji: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  if (emoji.includes(query.trim())) {
    return true;
  }
  return keywordsFor(emoji).some((k) => k.toLowerCase().includes(q));
}
