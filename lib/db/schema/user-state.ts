import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { pages } from "./pages";
import { updatedAt } from "./types";
import { workspaces } from "./workspace";

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  lastWorkspaceId: uuid("last_workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  sidebarWidth: integer("sidebar_width").notNull().default(300),
  sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export const userHintStates = pgTable(
  "user_hint_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hintKey: text("hint_key").notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_hint_states_user_hint_idx").on(t.userId, t.hintKey),
    index("user_hint_states_user_idx").on(t.userId),
  ]
);

export const userFavorites = pgTable(
  "user_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_favorites_user_page_idx").on(t.userId, t.pageId),
    index("user_favorites_user_workspace_idx").on(t.userId, t.workspaceId),
  ]
);

export const userRecentlyVisited = pgTable(
  "user_recently_visited",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    visitedAt: timestamp("visited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("urv_user_page_idx").on(t.userId, t.pageId),
    index("urv_recent_idx").on(t.userId, t.workspaceId, t.visitedAt),
  ]
);

export type UserPreference = typeof userPreferences.$inferSelect;
export type UserFavorite = typeof userFavorites.$inferSelect;
export type UserRecentlyVisited = typeof userRecentlyVisited.$inferSelect;
