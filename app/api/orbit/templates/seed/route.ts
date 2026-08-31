import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { templateCategories, templates, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { BUILT_IN_TEMPLATES } from "@/lib/orbit/templates/built-in";
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

// POST /api/orbit/templates/seed — seed all 18 built-in templates (idempotent)
// Body: { force?: boolean } — if force=true, delete all existing built-ins first
export async function POST(req: Request) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };

  if (body.force) {
    await db
      .delete(templates)
      .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)));

    await writeAuditLog({
      actorId: session.user.id,
      action: "template.reseeded",
      targetType: "template",
      metadata: { force: true },
    });
  }

  // Insert only templates that don't already exist by name — safe to call
  // repeatedly (e.g. after BUILT_IN_TEMPLATES grows) without ever producing
  // duplicate rows for names that were seeded in an earlier pass.
  const existing = await db
    .select({ name: templates.name })
    .from(templates)
    .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)));
  const existingNames = new Set(existing.map((t) => t.name));

  const missing = BUILT_IN_TEMPLATES.filter((t) => !existingNames.has(t.name));
  if (missing.length === 0) {
    return Response.json({ message: "Already seeded", count: existing.length });
  }

  const categories = await db
    .select({ id: templateCategories.id, key: templateCategories.key })
    .from(templateCategories);
  const categoryIdByKey = new Map(categories.map((c) => [c.key, c.id]));

  const rows = missing.map((t) => {
    const categoryId = categoryIdByKey.get(t.category);
    if (!categoryId) {
      throw new Error(`Unknown template category key: ${t.category}`);
    }
    return {
      name: t.name,
      description: t.description,
      categoryId,
      isBuiltIn: true,
      status: "published" as const,
      workspaceId: null,
      createdBy: null,
      pageSnapshot: t.pageSnapshot,
    };
  });

  await db.insert(templates).values(rows);

  await writeAuditLog({
    actorId: session.user.id,
    action: "template.seeded",
    targetType: "template",
    metadata: { count: rows.length, names: rows.map((r) => r.name) },
  });

  return Response.json(
    { message: "Seeded", count: rows.length },
    { status: 201 }
  );
}

// PATCH /api/orbit/templates/seed — update icons for all existing built-in templates
export async function PATCH(_req: Request) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  // Build a name → icon map from the current BUILT_IN_TEMPLATES
  const iconMap: Record<string, string> = {};
  for (const t of BUILT_IN_TEMPLATES) {
    iconMap[t.name] = t.pageSnapshot.icon;
  }

  // Fetch all built-in templates from DB
  const existing = await db
    .select({
      id: templates.id,
      name: templates.name,
      pageSnapshot: templates.pageSnapshot,
    })
    .from(templates)
    .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)));

  let updated = 0;
  for (const row of existing) {
    const newIcon = iconMap[row.name];
    if (!newIcon) {
      continue;
    }

    const snap = (row.pageSnapshot ?? {}) as Record<string, unknown>;
    if (snap.icon === newIcon) {
      continue; // already up to date
    }

    await db
      .update(templates)
      .set({ pageSnapshot: { ...snap, icon: newIcon } })
      .where(eq(templates.id, row.id));
    updated++;
  }

  if (updated > 0) {
    await writeAuditLog({
      actorId: session.user.id,
      action: "template.icons_updated",
      targetType: "template",
      metadata: { updated },
    });
  }

  return Response.json({ message: "Icons updated", updated });
}
