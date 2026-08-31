import { DEFAULT_PAGE_TITLE } from "@/lib/pages/constants";

export function isMeaningfulTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return t.length > 0 && t.toLowerCase() !== DEFAULT_PAGE_TITLE.toLowerCase();
}

// A block only counts as meaningful once it holds something the reader
// would actually see — the initial empty paragraph every new page starts
// with must not itself trigger promotion.
export function isMeaningfulBlockContent(
  rows: { type: string; content: unknown }[]
): boolean {
  return rows.some((b) => {
    if (b.type !== "paragraph") {
      return true;
    }
    const text = (b.content as { text?: unknown } | null)?.text;
    if (!Array.isArray(text)) {
      return false;
    }
    return text.some((n) => {
      if (!n || typeof n !== "object") {
        return false;
      }
      const node = n as Record<string, unknown>;
      if (typeof node.text === "string" && node.text.trim().length > 0) {
        return true;
      }
      return (
        node.type === "mention" ||
        node.type === "pageMention" ||
        node.type === "dateMention"
      );
    });
  });
}
