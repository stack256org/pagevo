"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  workspaceMembers,
  workspaceStorageUsage,
  workspaces,
} from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { uniqueSlug } from "@/lib/workspaces/auth";

export async function createWorkspaceAction(formData: FormData) {
  const session = await requireSession();
  const name = (formData.get("name") as string)?.trim();

  const rawKind = formData.get("kind") as string | null;
  const kind: "personal" | "team" = rawKind === "team" ? "team" : "personal";

  if (!name) {
    redirect(`/app/workspaces/new?kind=${kind}&error=empty-name`);
  }

  const slug = await uniqueSlug(name);

  const workspace = await db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({ name, slug, kind, createdBy: session.user.id })
      .returning();

    await tx.insert(workspaceStorageUsage).values({ workspaceId: ws.id });

    await tx.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId: session.user.id,
      role: "admin",
      status: "active",
      joinedAt: new Date(),
    });

    return ws;
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: "workspace.created",
    targetType: "workspace",
    targetId: workspace.id,
    metadata: {
      name: workspace.name,
      slug: workspace.slug,
      kind: workspace.kind,
    },
  });

  redirect(`/app/workspaces/setup/${workspace.slug}`);
}
