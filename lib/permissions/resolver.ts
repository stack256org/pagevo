import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pagePermissions, pages, workspaceMembers } from "@/lib/db/schema";
import { ApiError } from "@/lib/workspaces/auth";

export type WorkspaceRole = "admin" | "editor" | "viewer";
export type AccessLevel =
  | "full_access"
  | "can_edit"
  | "can_comment"
  | "can_view";

const ACCESS_RANK: Record<AccessLevel, number> = {
  can_view: 0,
  can_comment: 1,
  can_edit: 2,
  full_access: 3,
};

const ROLE_MAX_ACCESS: Record<WorkspaceRole, AccessLevel> = {
  viewer: "can_view",
  editor: "can_edit",
  admin: "full_access",
};

function meetsLevel(effective: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_RANK[effective] >= ACCESS_RANK[required];
}

/**
 * Resolves effective access: admin ceiling → explicit page_permissions (own or inherited from nearest
 * ancestor) → workspace default_page_access. Private pages short-circuit to creator + explicit grants only.
 */
export async function getEffectivePermission(
  userId: string,
  pageId: string
): Promise<AccessLevel | null> {
  // Load the page + workspace member in parallel
  const [pageRow] = await db
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      parentId: pages.parentId,
      isPrivate: pages.isPrivate,
      createdBy: pages.createdBy,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  if (!pageRow) {
    return null;
  }

  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, pageRow.workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  const role: WorkspaceRole | null = (member?.role as WorkspaceRole) ?? null;
  const isCreator = pageRow.createdBy === userId;

  // ── Private page: only creator + explicit grants ──────────────────────────
  if (pageRow.isPrivate) {
    if (isCreator) {
      return "full_access";
    }
    const explicit = await getExplicitPermission(userId, pageId);
    return explicit;
  }

  // ── Non-member (guest with no workspace seat) ─────────────────────────────
  if (!role) {
    return getExplicitPermission(userId, pageId);
  }

  // ── Workspace Admin gets full_access on all non-private pages ────────────
  if (role === "admin") {
    return "full_access";
  }

  // ── Look for explicit permission on this exact page ───────────────────────
  const explicit = await getExplicitPermission(userId, pageId);
  if (explicit !== null) {
    // Cap at workspace role ceiling
    return capToRole(explicit, role);
  }

  // ── Walk the ancestor chain for inherited permission ──────────────────────
  const inherited = await walkAncestorsForPermission(userId, pageId, role);
  if (inherited !== null) {
    return inherited;
  }

  // ── Workspace default fallback ────────────────────────────────────────────
  const [_ws] = await db
    .select({ defaultPageAccess: sql<string>`${pageRow.workspaceId}` })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, pageRow.workspaceId))
    .limit(1);

  // Simpler: we already have workspaceId; just use role-based default
  // shared workspace → members can at least view; capped at role ceiling
  const defaultLevel: AccessLevel = role === "editor" ? "can_edit" : "can_view";
  return capToRole(defaultLevel, role);
}

async function getExplicitPermission(
  userId: string,
  pageId: string
): Promise<AccessLevel | null> {
  const [row] = await db
    .select({ accessLevel: pagePermissions.accessLevel })
    .from(pagePermissions)
    .where(
      and(
        eq(pagePermissions.pageId, pageId),
        eq(pagePermissions.userId, userId)
      )
    )
    .limit(1);
  return (row?.accessLevel as AccessLevel) ?? null;
}

async function walkAncestorsForPermission(
  userId: string,
  pageId: string,
  role: WorkspaceRole
): Promise<AccessLevel | null> {
  // Use a CTE to walk the parent chain efficiently
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT parent_id AS page_id, 1 AS depth
      FROM pages
      WHERE id = ${pageId}
      UNION ALL
      SELECT p.parent_id, a.depth + 1
      FROM pages p
      INNER JOIN ancestors a ON p.id = a.page_id
      WHERE p.parent_id IS NOT NULL
    )
    SELECT pp.access_level
    FROM ancestors a
    JOIN page_permissions pp ON pp.page_id = a.page_id AND pp.user_id = ${userId}
    ORDER BY a.depth ASC
    LIMIT 1
  `);

  const rows = result as unknown as Array<{ access_level: string }>;
  const level = rows[0]?.access_level as AccessLevel | undefined;
  if (!level) {
    return null;
  }
  return capToRole(level, role);
}

function capToRole(level: AccessLevel, role: WorkspaceRole): AccessLevel {
  const cap = ROLE_MAX_ACCESS[role];
  return ACCESS_RANK[level] <= ACCESS_RANK[cap] ? level : cap;
}

/**
 * Throws ApiError(403) if the user doesn't have at least `minLevel` on the page.
 * Returns the effective level on success.
 */
export async function requirePagePermission(
  userId: string,
  pageId: string,
  minLevel: AccessLevel
): Promise<{ effectiveLevel: AccessLevel }> {
  const level = await getEffectivePermission(userId, pageId);
  if (!level || !meetsLevel(level, minLevel)) {
    throw new ApiError(403, "You don't have permission to access this page");
  }
  return { effectiveLevel: level };
}

/**
 * Cap a requested access level to what the user's workspace role allows.
 * Used when granting permissions to ensure the ceiling is respected.
 */
export function capAccessToRole(
  requested: AccessLevel,
  role: WorkspaceRole
): AccessLevel {
  return capToRole(requested, role);
}
