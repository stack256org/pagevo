// One-off migration: sets "Upvoted by" to voteMode and drops the now-redundant
// "Total votes" property (vote count now lives on the "Upvoted by" badge). Idempotent.
//
// Usage: pnpm tsx scripts/migrate-voting-properties.ts

import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const VOTE_PROP_NAME = "Upvoted by";
const TOTAL_PROP_NAME = "Total votes";

async function main() {
  const [{ db }, { databaseProperties, databaseViews, pages, templates }] =
    await Promise.all([import("@/lib/db"), import("@/lib/db/schema")]);

  // ── 1. Fix existing database instances ──────────────────────────────────────
  const dbPages = await db
    .select({ id: pages.id, title: pages.title })
    .from(pages)
    .where(eq(pages.kind, "database"));

  let dbsTouched = 0;
  let voteModeSet = 0;
  let totalRemoved = 0;

  for (const page of dbPages) {
    const props = await db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, page.id));

    const voteProp = props.find(
      (p) => p.name === VOTE_PROP_NAME && p.type === "person"
    );
    if (!voteProp) {
      continue; // not a voting database
    }
    const totalProp = props.find((p) => p.name === TOTAL_PROP_NAME);

    let touched = false;

    // "Upvoted by" → person + voteMode. Merge, don't clobber, existing config.
    const voteConfig =
      (voteProp.config as Record<string, unknown> | null) ?? {};
    if (!voteConfig.voteMode) {
      await db
        .update(databaseProperties)
        .set({ config: { ...voteConfig, voteMode: true } })
        .where(eq(databaseProperties.id, voteProp.id));
      voteModeSet++;
      touched = true;
      console.log(`  [${page.title}] "${VOTE_PROP_NAME}" → voteMode: true`);
    }

    // "Total votes" → removed. Clean up any JSONB view references first (FK
    // columns like group_by/calendar cascade to null on their own; sorts,
    // filters, hidden lists, per-property overrides/order are plain JSONB and
    // won't), then delete the property (its property_values cascade away).
    if (totalProp) {
      const views = await db
        .select()
        .from(databaseViews)
        .where(eq(databaseViews.databaseId, page.id));
      for (const view of views) {
        const sorts = (view.sorts as { propertyId: string }[]).filter(
          (s) => s.propertyId !== totalProp.id
        );
        const filters = (view.filters as { propertyId: string }[]).filter(
          (f) => f.propertyId !== totalProp.id
        );
        const hidden = (view.hiddenPropertyIds as string[]).filter(
          (id) => id !== totalProp.id
        );
        const order = (view.propertyOrder as string[]).filter(
          (id) => id !== totalProp.id
        );
        const overrides = {
          ...(view.propertyOverrides as Record<string, unknown>),
        };
        delete overrides[totalProp.id];
        const cardProps = (view.cardDisplayProps as string[]).filter(
          (id) => id !== totalProp.id
        );
        await db
          .update(databaseViews)
          .set({
            sorts,
            filters,
            hiddenPropertyIds: hidden,
            propertyOrder: order,
            propertyOverrides: overrides,
            cardDisplayProps: cardProps,
          })
          .where(eq(databaseViews.id, view.id));
      }
      await db
        .delete(databaseProperties)
        .where(eq(databaseProperties.id, totalProp.id));
      totalRemoved++;
      touched = true;
      console.log(`  [${page.title}] "${TOTAL_PROP_NAME}" removed`);
    }

    if (touched) {
      dbsTouched++;
    }
  }

  console.log(
    `\nExisting databases: ${dbsTouched} touched (${voteModeSet} voteMode set, ${totalRemoved} "Total votes" removed).`
  );

  // ── 2. Fix the stored built-in template snapshot ────────────────────────────
  const builtIns = await db
    .select({
      id: templates.id,
      name: templates.name,
      pageSnapshot: templates.pageSnapshot,
    })
    .from(templates)
    .where(
      and(
        eq(templates.isBuiltIn, true),
        eq(templates.name, "Brainstorm Session")
      )
    );

  let templatesFixed = 0;
  for (const tpl of builtIns) {
    const snap = tpl.pageSnapshot as {
      database_schema?: {
        properties?: { name: string; type: string; voteMode?: boolean }[];
      };
    } | null;
    const schema = snap?.database_schema;
    if (!schema?.properties) {
      continue;
    }

    let touched = false;

    // Drop "Total votes" from the template's property list.
    const before = schema.properties.length;
    schema.properties = schema.properties.filter(
      (p) => p.name !== TOTAL_PROP_NAME
    );
    if (schema.properties.length !== before) {
      touched = true;
    }

    // Ensure "Upvoted by" carries voteMode.
    for (const sp of schema.properties) {
      if (sp.name === VOTE_PROP_NAME && sp.type === "person" && !sp.voteMode) {
        sp.voteMode = true;
        touched = true;
      }
    }

    if (touched) {
      await db
        .update(templates)
        .set({ pageSnapshot: snap })
        .where(eq(templates.id, tpl.id));
      templatesFixed++;
      console.log(`Stored template "${tpl.name}" snapshot updated.`);
    }
  }

  console.log(`Built-in templates: ${templatesFixed} updated.`);
  console.log("\nDone.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
