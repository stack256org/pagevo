import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pageClosure, pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

// POST /api/pages/restore — restore many trashed pages in one transaction.
// N concurrent single-page restores are racy (a child can detach to root if processed before its still-deleted parent); batching avoids that by evaluating against the final state.
export async function POST(req: Request) {
  try {
    const session = await getSession();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const requested = await db
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        isDeleted: pages.isDeleted,
        parentId: pages.parentId,
      })
      .from(pages)
      .where(inArray(pages.id, parsed.data.ids));

    if (requested.length === 0) {
      return apiError(404, "No matching pages");
    }

    // Permission is per workspace, not per page — check each distinct one once
    // instead of N times inside the loop below.
    const workspaceIds = [...new Set(requested.map((p) => p.workspaceId))];
    for (const workspaceId of workspaceIds) {
      await requireWorkspaceMember(workspaceId, session.user.id, "editor");
    }

    // Already-restored pages are skipped rather than failing the whole batch —
    // selecting both a parent and its child is normal, and the parent's restore
    // legitimately covers the child.
    const roots = requested.filter((p) => p.isDeleted);
    if (roots.length === 0) {
      return Response.json({ restored: 0, alreadyRestored: requested.length });
    }

    // Expand each selected page to its full subtree, so restoring a template
    // brings its sub-pages and database entries back with it.
    const closure = await db
      .select({ descendantId: pageClosure.descendantId })
      .from(pageClosure)
      .where(
        inArray(
          pageClosure.ancestorId,
          roots.map((p) => p.id)
        )
      );

    const restoreIds = [
      ...new Set([
        ...roots.map((p) => p.id),
        ...closure.map((c) => c.descendantId),
      ]),
    ];

    const restoredCount = await db.transaction(async (tx) => {
      await tx
        .update(pages)
        .set({
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        })
        .where(inArray(pages.id, restoreIds));

      // Detach to workspace root only if the parent is still in Trash after this restore; evaluated post-UPDATE against the final state.
      const restoredSet = new Set(restoreIds);
      const withParents = await tx
        .select({ id: pages.id, parentId: pages.parentId })
        .from(pages)
        .where(inArray(pages.id, restoreIds));

      const candidateParentIds = [
        ...new Set(
          withParents
            .map((p) => p.parentId)
            .filter((pid): pid is string => !!pid && !restoredSet.has(pid))
        ),
      ];

      let stillDeletedParents = new Set<string>();
      if (candidateParentIds.length > 0) {
        const parentRows = await tx
          .select({ id: pages.id, isDeleted: pages.isDeleted })
          .from(pages)
          .where(inArray(pages.id, candidateParentIds));
        stillDeletedParents = new Set(
          parentRows.filter((p) => p.isDeleted).map((p) => p.id)
        );
        // A parent row that no longer exists at all (hard-deleted) also can't
        // be kept as a parent.
        const found = new Set(parentRows.map((p) => p.id));
        for (const pid of candidateParentIds) {
          if (!found.has(pid)) {
            stillDeletedParents.add(pid);
          }
        }
      }

      const orphanIds = withParents
        .filter((p) => p.parentId && stillDeletedParents.has(p.parentId))
        .map((p) => p.id);

      if (orphanIds.length > 0) {
        await tx
          .update(pages)
          .set({ parentId: null })
          .where(inArray(pages.id, orphanIds));
      }

      return restoreIds.length;
    });

    return Response.json({
      restored: restoredCount,
      requested: parsed.data.ids.length,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
