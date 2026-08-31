import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { templateStatus, updatedAt } from "./types";
import { workspaces } from "./workspace";

// Categories are a managed table (not a fixed enum) so Orbit Admin can add
// new ones without a schema migration — see doc/bugs/2026-07-14-*-template-categories.md.
export const templateCategories = pgTable("template_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  // Lucide icon name (e.g. "Rocket"), chosen by the admin who creates the
  // category. Nullable so rows created before this column existed keep
  // working — consumers fall back to a positional default for those.
  icon: text("icon"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => templateCategories.id),
    isBuiltIn: boolean("is_built_in").notNull().default(false),
    status: templateStatus("status").notNull().default("published"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    pageSnapshot: jsonb("page_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("templates_workspace_idx").on(t.workspaceId),
    index("templates_category_idx").on(t.categoryId),
  ]
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type TemplateCategory = typeof templateCategories.$inferSelect;
export type NewTemplateCategory = typeof templateCategories.$inferInsert;
