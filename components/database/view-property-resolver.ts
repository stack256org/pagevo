import type { DbProperty, DbView } from "@/components/database/types";

// A view's own override always wins; falling back to the property's global
// config keeps every existing database looking exactly the same as before
// this existed — nothing is migrated into any view's overrides automatically,
// so a setting only starts diverging per-view once a view is actually edited.

export function resolveDisplayAs(
  prop: DbProperty,
  view: DbView | null | undefined
): "select" | "checkbox" {
  return (
    view?.propertyOverrides?.[prop.id]?.displayAs ??
    prop.config?.displayAs ??
    "select"
  );
}

export function resolveWrapContent(
  prop: DbProperty,
  view: DbView | null | undefined
): boolean {
  return !!(
    view?.propertyOverrides?.[prop.id]?.wrapContent ?? prop.config?.wrapContent
  );
}

export function resolveColWidth(
  prop: DbProperty,
  view: DbView | null | undefined,
  fallback: number
): number {
  return view?.propertyOverrides?.[prop.id]?.width ?? fallback;
}

// Properties not yet present in the view's saved order (new columns, or views
// saved before per-view order existed) are appended at the end in their
// existing global order, so they never silently vanish from a reordered view.
export function resolvePropertyOrder<
  T extends { id: string; orderIndex: number },
>(properties: T[], view: DbView | null | undefined): T[] {
  const order = view?.propertyOrder ?? [];
  if (!order.length) {
    return [...properties].sort((a, b) => a.orderIndex - b.orderIndex);
  }
  const known = new Set(order);
  const ordered = order
    .map((id) => properties.find((p) => p.id === id))
    .filter(Boolean) as T[];
  const extras = properties
    .filter((p) => !known.has(p.id))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  return [...ordered, ...extras];
}
