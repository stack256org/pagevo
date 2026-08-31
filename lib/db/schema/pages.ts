import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/constants";
import { users } from "./auth";
import { blockType, fontFamily, pageKind, updatedAt } from "./types";
import { workspaces } from "./workspace";

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: varchar("short_id", { length: 12 }).notNull().unique(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => pages.id, {
      onDelete: "cascade",
    }),
    kind: pageKind("kind").notNull().default("page"),
    databaseId: uuid("database_id").references((): AnyPgColumn => pages.id, {
      onDelete: "cascade",
    }),
    defaultViewId: uuid("default_view_id"),
    orderIndex: integer("order_index").notNull().default(0),
    title: text("title").notNull().default(DEFAULT_PAGE_TITLE),
    icon: text("icon"),
    coverUrl: text("cover_url"),
    coverPosition: real("cover_position").notNull().default(0.5),
    isFullWidth: boolean("is_full_width").notNull().default(false),
    fontFamily: fontFamily("font_family").notNull().default("default"),
    isSmallText: boolean("is_small_text").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),
    isDraft: boolean("is_draft").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    trashWarningSent: boolean("trash_warning_sent").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    lastEditedBy: uuid("last_edited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("pages_short_id_idx").on(t.shortId),
    index("pages_workspace_idx").on(t.workspaceId),
    index("pages_parent_order_idx").on(t.parentId, t.orderIndex),
    index("pages_database_idx").on(t.databaseId),
    index("pages_live_tree_idx").on(t.workspaceId, t.isDeleted),
  ]
);

export const pageClosure = pgTable(
  "page_closure",
  {
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ancestorId, t.descendantId] }),
    index("page_closure_descendant_idx").on(t.descendantId),
  ]
);

export const pageVersions = pgTable(
  "page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    contentSnapshot: jsonb("content_snapshot").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    label: text("label"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("page_versions_page_idx").on(t.pageId, t.createdAt)]
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    parentBlockId: uuid("parent_block_id").references(
      (): AnyPgColumn => blocks.id,
      { onDelete: "cascade" }
    ),
    type: blockType("type").notNull(),
    content: jsonb("content").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    orderIndex: integer("order_index").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("blocks_page_order_idx").on(t.pageId, t.orderIndex),
    index("blocks_parent_idx").on(t.parentBlockId),
  ]
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type PageVersion = typeof pageVersions.$inferSelect;
