/**
 * Walks TipTap JSON and extracts all user IDs from @mention nodes.
 * Used by comment API routes to determine who needs a mention notification.
 */
export function extractMentionedUserIds(
  content: Record<string, unknown>
): string[] {
  const ids: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }
    const n = node as Record<string, unknown>;

    if (n.type === "mention") {
      const attrs = n.attrs as
        | { mentionType?: string; id?: string }
        | undefined;
      if (attrs?.mentionType === "user" && typeof attrs.id === "string") {
        ids.push(attrs.id);
      }
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }
  }

  walk(content);
  return [...new Set(ids)];
}

/**
 * Extracts plain text from TipTap JSON (for orphan detection character offsets).
 */
export function extractPlainText(content: Record<string, unknown>): string {
  const parts: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }
    const n = node as Record<string, unknown>;

    if (n.type === "text" && typeof n.text === "string") {
      parts.push(n.text);
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }
  }

  walk(content);
  return parts.join("");
}
