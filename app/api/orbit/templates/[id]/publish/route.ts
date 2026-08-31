import { and, eq } from "drizzle-orm";
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

// PATCH /api/orbit/templates/:id/publish
export async function PATCH(
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
    .where(and(eq(templates.id, id), eq(templates.isBuiltIn, true)))
    .limit(1);
  if (!tpl) {
    return apiError(404, "Template not found");
  }

  if (!tpl.name.trim()) {
    return apiError(400, "Template needs a name before publishing");
  }
  if (!tpl.categoryId) {
    return apiError(400, "Template needs a category before publishing");
  }

  const snapshot = tpl.pageSnapshot as {
    blocks?: {
      type?: string;
      content?: { text?: { text?: string }[] } | null;
    }[];
    database_schema?: unknown;
  } | null;
  const hasContent =
    !!snapshot?.database_schema ||
    (snapshot?.blocks ?? []).some(
      (b) =>
        b.type !== "paragraph" ||
        (b.content?.text ?? []).some((t) => (t.text ?? "").trim().length > 0)
    );
  if (!hasContent) {
    return apiError(400, "Template needs some content before publishing");
  }

  const [updated] = await db
    .update(templates)
    .set({ status: "published" })
    .where(eq(templates.id, id))
    .returning();

  await writeAuditLog({
    actorId: session.user.id,
    action: "template.published",
    targetType: "template",
    targetId: id,
    metadata: { name: updated!.name },
  });

  return Response.json(updated);
}
