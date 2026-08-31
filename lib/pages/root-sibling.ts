export interface OrderedPage {
  id: string;
  orderIndex: number;
  parentId: string | null;
}

// Falls back to the nearest sibling (prev, else next) in sidebar order after deleting a root item.
// Private and shared roots share one orderIndex axis, so they're treated as a single combined list here.
export function findRootFallback<T extends OrderedPage>(
  pages: T[],
  deletedId: string
): T | null {
  const idSet = new Set(pages.map((p) => p.id));
  const roots = pages
    .filter((p) => !p.parentId || !idSet.has(p.parentId))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = roots.findIndex((p) => p.id === deletedId);
  if (idx === -1) {
    return null;
  }
  return roots[idx - 1] ?? roots[idx + 1] ?? null;
}
