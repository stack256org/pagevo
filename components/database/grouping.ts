// Single source of truth for group membership, shared by board/gallery/table views so
// they never disagree. Note: person grouping is MULTI-membership (an entry with 2
// assignees appears in both groups), unlike select/status/checkbox's single-membership.

import type {
  DbEntry,
  DbProperty,
  SelectOption,
} from "@/components/database/types";

export type GroupableType = "select" | "status" | "checkbox" | "person";

export interface GroupDef {
  color: string | null;
  id: string | null;
  label: string;
}

const GROUPABLE_TYPES: ReadonlySet<string> = new Set([
  "select",
  "status",
  "checkbox",
  "person",
]);

export function isGroupableType(type: string): type is GroupableType {
  return GROUPABLE_TYPES.has(type);
}

// select/status groups are user-managed (create/rename/recolor/reorder/delete
// an option) — checkbox/person groups are derived, so that chrome doesn't
// apply to them. Board's "Add option" panel and the group header menu's
// "Edit groups"/"Move to Trash" entries key off this.
export function areGroupsEditable(type: string): boolean {
  return type === "select" || type === "status";
}

function personLabel(
  userId: string,
  entries: DbEntry[],
  valueMap: Map<string, Map<string, unknown>>,
  propId: string
): string {
  for (const entry of entries) {
    const v = valueMap.get(entry.id)?.get(propId) as {
      userIds?: string[];
      _members?: { id: string; name: string; email: string }[];
    } | null;
    const member = v?._members?.find((m) => m.id === userId);
    if (member) {
      return member.name || member.email || userId;
    }
  }
  return userId;
}

export function deriveGroups(
  property: DbProperty,
  entries: DbEntry[],
  valueMap: Map<string, Map<string, unknown>>
): GroupDef[] {
  switch (property.type) {
    case "select":
    case "status": {
      const options = (property.config?.options ?? []) as SelectOption[];
      return options.map((o) => ({ id: o.id, label: o.name, color: o.color }));
    }
    case "checkbox":
      return [
        { id: "unchecked", label: "Unchecked", color: null },
        { id: "checked", label: "Checked", color: null },
      ];
    case "person": {
      const seen = new Set<string>();
      const groups: GroupDef[] = [];
      for (const entry of entries) {
        const v = valueMap.get(entry.id)?.get(property.id) as {
          userIds?: string[];
        } | null;
        for (const id of v?.userIds ?? []) {
          if (seen.has(id)) {
            continue;
          }
          seen.add(id);
          groups.push({
            id,
            label: personLabel(id, entries, valueMap, property.id),
            color: null,
          });
        }
      }
      return groups;
    }
    default:
      return [];
  }
}

// The ids a single entry's raw value belongs to. select/status/checkbox
// always return exactly one id (never more) — person can return several, or
// none (unassigned, folded into the `null` "no group" bucket by callers).
export function getEntryGroupIds(
  property: DbProperty,
  value: unknown
): (string | null)[] {
  const v = value as Record<string, unknown> | null;
  switch (property.type) {
    case "select":
    case "status":
      return [(v?.optionId as string | undefined) ?? null];
    case "checkbox":
      return [(v?.checked as boolean | undefined) ? "checked" : "unchecked"];
    case "person": {
      const ids = (v?.userIds as string[] | undefined) ?? [];
      return ids.length ? ids : [null];
    }
    default:
      return [null];
  }
}

// The property-value patch to pre-fill when creating a new entry directly
// inside a given group/column (e.g. Board's "+ Add entry" button, Gallery's
// "+ New entry"). `groupId: null` means the ungrouped/ambiguous bucket, which
// for every groupable type just means "don't set a value."
export function defaultValueForGroup(
  property: DbProperty,
  groupId: string | null
): unknown {
  switch (property.type) {
    case "select":
    case "status":
      return groupId ? { optionId: groupId } : undefined;
    case "checkbox":
      return { checked: groupId === "checked" };
    case "person":
      return groupId ? { userIds: [groupId] } : undefined;
    default:
      return;
  }
}

// Cross-column drag semantics differ by type: select/status/checkbox REPLACE
// the value outright; person ADDS the target person without disturbing any
// other assignees already on the entry, and removing a card from a person's
// column removes only that person (used by board-view.tsx's onDragEnd).
export function valueAfterGroupMove(
  property: DbProperty,
  currentValue: unknown,
  fromGroupId: string | null,
  toGroupId: string | null
): unknown {
  if (property.type === "person") {
    const ids = (
      (currentValue as { userIds?: string[] } | null)?.userIds ?? []
    ).filter((id) => id !== fromGroupId);
    if (toGroupId && !ids.includes(toGroupId)) {
      ids.push(toGroupId);
    }
    return { userIds: ids };
  }
  return (
    defaultValueForGroup(property, toGroupId) ??
    (property.type === "checkbox" ? { checked: false } : { optionId: null })
  );
}
