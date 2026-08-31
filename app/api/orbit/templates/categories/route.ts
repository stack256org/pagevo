import { asc, count, eq, max } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { templateCategories, templates, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import {
  CATEGORY_ICON_NAMES,
  DEFAULT_CATEGORY_ICON,
} from "@/lib/orbit/category-icons";
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

function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 48) || "category"
  );
}

async function uniqueKey(label: string): Promise<string> {
  const base = slugifyKey(label);
  let suffix = 0;
  while (true) {
    const key = suffix === 0 ? base : `${base}_${suffix}`;
    const [existing] = await db
      .select({ id: templateCategories.id })
      .from(templateCategories)
      .where(eq(templateCategories.key, key))
      .limit(1);
    if (!existing) {
      return key;
    }
    suffix++;
  }
}

const createSchema = z.object({
  label: z.string().min(1).max(60),
  // Constrained to the shared registry rather than a free string — an
  // unknown name would render as the fallback icon with no indication
  // anything went wrong.
  icon: z.enum(CATEGORY_ICON_NAMES as [string, ...string[]]).optional(),
});

// GET /api/orbit/templates/categories — list all template categories, with
// how many templates use each (so the admin UI can disable deletion up
// front instead of only failing after the fact).
export async function GET() {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const list = await db
    .select({
      id: templateCategories.id,
      key: templateCategories.key,
      label: templateCategories.label,
      icon: templateCategories.icon,
      orderIndex: templateCategories.orderIndex,
      createdAt: templateCategories.createdAt,
      templateCount: count(templates.id),
    })
    .from(templateCategories)
    .leftJoin(templates, eq(templates.categoryId, templateCategories.id))
    .groupBy(templateCategories.id)
    .orderBy(asc(templateCategories.orderIndex));

  return Response.json(
    list.map((c) => ({ ...c, templateCount: Number(c.templateCount) }))
  );
}

// POST /api/orbit/templates/categories — create a new template category
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

  const key = await uniqueKey(parsed.data.label);

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(templateCategories.orderIndex) })
    .from(templateCategories);
  const orderIndex = (maxOrder ?? -1) + 1;

  const [category] = await db
    .insert(templateCategories)
    .values({
      key,
      label: parsed.data.label,
      icon: parsed.data.icon ?? DEFAULT_CATEGORY_ICON,
      orderIndex,
    })
    .returning();

  await writeAuditLog({
    actorId: session.user.id,
    action: "template_category.created",
    targetType: "template",
    targetId: category!.id,
    metadata: {
      key: category!.key,
      label: category!.label,
      icon: category!.icon,
    },
  });

  return Response.json(category, { status: 201 });
}
