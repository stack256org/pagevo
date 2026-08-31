import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { computeDerivedValues } from "@/lib/databases/compute-values";
import { db } from "@/lib/db";
import {
  databaseProperties,
  pages,
  propertyValues,
  workspaceMembers,
} from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: entryId } = await params;
  const session = await requireSession();

  const [entry] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, entryId))
    .limit(1);
  if (!entry) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, entry.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);
  if (!member) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const values = await db
    .select()
    .from(propertyValues)
    .where(eq(propertyValues.entryId, entryId));

  // Rollup/Formula/Created-by are computed, not stored — same helper the
  // live database entries route and the initial page-load server component
  // use (lib/databases/compute-values.ts), so opening a single entry as its
  // own full page shows the same values as seeing it in a table row.
  let allValues: unknown[] = values;
  if (entry.databaseId) {
    const properties = await db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, entry.databaseId));

    const valMap = new Map<string, Map<string, unknown>>();
    for (const v of values) {
      if (!valMap.has(v.entryId)) {
        valMap.set(v.entryId, new Map());
      }
      valMap.get(v.entryId)!.set(v.propertyId, v.value);
    }

    const computedValues = await computeDerivedValues(
      properties,
      [entry],
      valMap
    );
    allValues = [
      ...values,
      ...computedValues.map((cv) => ({
        id: `computed:${cv.propertyId}:${cv.entryId}`,
        entryId: cv.entryId,
        propertyId: cv.propertyId,
        value: cv.value,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
    ];
  }

  return Response.json(allValues);
}
