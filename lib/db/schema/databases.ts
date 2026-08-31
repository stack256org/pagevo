import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { pages } from "./pages";
import {
  entryOpenMode,
  filterLogicType,
  galleryCardSize,
  propertyType,
  updatedAt,
  viewType,
} from "./types";
import { workspaces } from "./workspace";

export const databaseViews = pgTable(
  "database_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: viewType("type").notNull(),
    groupByPropertyId: uuid("group_by_property_id").references(
      (): AnyPgColumn => databaseProperties.id,
      { onDelete: "set null" }
    ),
    calendarPropertyId: uuid("calendar_property_id").references(
      (): AnyPgColumn => databaseProperties.id,
      { onDelete: "set null" }
    ),
    ganttStartPropertyId: uuid("gantt_start_property_id").references(
      (): AnyPgColumn => databaseProperties.id,
      { onDelete: "set null" }
    ),
    ganttEndPropertyId: uuid("gantt_end_property_id").references(
      (): AnyPgColumn => databaseProperties.id,
      { onDelete: "set null" }
    ),
    filters: jsonb("filters").notNull().default(sql`'[]'::jsonb`),
    sorts: jsonb("sorts").notNull().default(sql`'[]'::jsonb`),
    cardDisplayProps: jsonb("card_display_props")
      .notNull()
      .default(sql`'[]'::jsonb`),
    hiddenPropertyIds: jsonb("hidden_property_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    boardSettings: jsonb("board_settings").notNull().default(sql`'{}'::jsonb`),
    // Per-view overrides (displayAs/wrapContent/width) keyed by property id, and
    // a per-view column order — both fall back to the property's own global
    // config/orderIndex when absent, so one view's settings never bleed into
    // another's (e.g. Board showing Status as a checkbox doesn't affect Table).
    propertyOverrides: jsonb("property_overrides")
      .notNull()
      .default(sql`'{}'::jsonb`),
    propertyOrder: jsonb("property_order").notNull().default(sql`'[]'::jsonb`),
    galleryCardSize: galleryCardSize("gallery_card_size"),
    entryOpenMode: entryOpenMode("entry_open_mode")
      .notNull()
      .default("side_panel"),
    filterLogic: filterLogicType("filter_logic").notNull().default("and"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [index("database_views_database_idx").on(t.databaseId)]
);

export const databaseProperties = pgTable(
  "database_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: propertyType("type").notNull(),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    defaultValue: jsonb("default_value"),
    isHidden: boolean("is_hidden").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    isBackRelation: boolean("is_back_relation").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [index("database_properties_database_idx").on(t.databaseId)]
);

export const propertyValues = pgTable(
  "property_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => databaseProperties.id, { onDelete: "cascade" }),
    value: jsonb("value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("property_values_entry_prop_idx").on(t.entryId, t.propertyId),
    index("property_values_property_idx").on(t.propertyId),
    index("property_values_value_gin_idx").using("gin", t.value),
  ]
);

// One row per (entry, date-property) that currently has a reminder set — the
// cron scan in entry-reminder-send.ts reads off `entry_reminders_due_idx`
// instead of scanning every date-typed property_values row on every tick.
export const entryReminders = pgTable(
  "entry_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => databaseProperties.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    notified: boolean("notified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("entry_reminders_entry_prop_idx").on(t.entryId, t.propertyId),
    index("entry_reminders_due_idx").on(t.remindAt, t.notified),
  ]
);

export type DatabaseView = typeof databaseViews.$inferSelect;
export type DatabaseProperty = typeof databaseProperties.$inferSelect;
export type PropertyValue = typeof propertyValues.$inferSelect;
export type EntryReminder = typeof entryReminders.$inferSelect;
