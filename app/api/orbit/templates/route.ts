import { and, desc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { templateCategories, templates, users } from "@/lib/db/schema";
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

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  categoryId: z.string().uuid(),
  pageSnapshot: z.object({
    title: z.string(),
    icon: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    is_full_width: z.boolean().optional(),
    font_family: z.string().optional(),
    blocks: z.array(z.unknown()).default([]),
    subpages: z.array(z.object({ title: z.string() })).default([]),
    database_schema: z.unknown().nullable().default(null),
  }),
});

// GET /api/orbit/templates — list all built-in templates (draft + published)
export async function GET() {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const list = await db
    .select()
    .from(templates)
    .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)))
    .orderBy(desc(templates.updatedAt));

  return Response.json(list);
}

// POST /api/orbit/templates — create a new built-in template
export async function POST(req: Request) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { name, description, categoryId, pageSnapshot } = parsed.data;

  const [cat] = await db
    .select({ id: templateCategories.id })
    .from(templateCategories)
    .where(eq(templateCategories.id, categoryId))
    .limit(1);
  if (!cat) {
    return apiError(400, "Unknown category");
  }

  const [tpl] = await db
    .insert(templates)
    .values({
      name,
      description: description ?? null,
      categoryId,
      isBuiltIn: true,
      status: "draft",
      workspaceId: null,
      createdBy: null,
      pageSnapshot,
    })
    .returning();

  await writeAuditLog({
    actorId: session.user.id,
    action: "template.created",
    targetType: "template",
    targetId: tpl!.id,
    metadata: { name: tpl!.name, categoryId: tpl!.categoryId },
  });

  return Response.json(tpl, { status: 201 });
}
