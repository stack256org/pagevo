import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { templates, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

async function requirePlatformAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (user?.role !== "admin") {
    return null;
  }
  return session;
}

// POST /api/orbit/templates/:id/duplicate — copy a built-in template as a new draft
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const { id } = await params;
  const [tpl] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, id),
        eq(templates.isBuiltIn, true),
        isNull(templates.workspaceId)
      )
    )
    .limit(1);
  if (!tpl) {
    return apiError(404, "Template not found");
  }

  const [copy] = await db
    .insert(templates)
    .values({
      name: `${tpl.name} (copy)`,
      description: tpl.description,
      categoryId: tpl.categoryId,
      isBuiltIn: true,
      status: "draft",
      workspaceId: null,
      createdBy: null,
      pageSnapshot: tpl.pageSnapshot,
    })
    .returning();

  await writeAuditLog({
    actorId: session.user.id,
    action: "template.duplicated",
    targetType: "template",
    targetId: copy!.id,
    metadata: { name: copy!.name, sourceId: tpl.id },
  });

  return Response.json(copy, { status: 201 });
}
