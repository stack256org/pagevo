import {
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
import { searchSourceType, tsvector, updatedAt } from "./types";
import { workspaces } from "./workspace";

export const searchIndex = pgTable(
  "search_index",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceType: searchSourceType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    title: text("title"),
    searchVector: tsvector("search_vector"),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("search_index_source_idx").on(t.sourceType, t.sourceId),
    index("search_index_workspace_idx").on(t.workspaceId),
    index("search_index_vector_idx").using("gin", t.searchVector),
  ]
);

export type SearchIndex = typeof searchIndex.$inferSelect;

// One row per non-empty search a user actually ran — powers the Orbit
// Analytics "search usage & no-result rate" metrics. Never joined into the
// user-facing search response itself; write-only from the search route.
export const searchQueryLog = pgTable(
  "search_query_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("search_query_log_created_idx").on(t.createdAt),
    index("search_query_log_workspace_idx").on(t.workspaceId),
  ]
);

export type SearchQueryLog = typeof searchQueryLog.$inferSelect;
