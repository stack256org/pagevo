import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import {
  defaultPageAccess,
  memberStatus,
  updatedAt,
  workspaceRole,
} from "./types";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").notNull().default("personal"),
  icon: text("icon"),
  defaultPageAccess: defaultPageAccess("default_page_access")
    .notNull()
    .default("can_edit"),
  inviteLinkToken: text("invite_link_token").unique(),
  inviteLinkActive: boolean("invite_link_active").notNull().default(false),
  inviteLinkRole: workspaceRole("invite_link_role").notNull().default("editor"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export const workspaceSlugRedirects = pgTable(
  "workspace_slug_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    oldSlug: text("old_slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("workspace_slug_redirects_old_slug_idx").on(t.oldSlug)]
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("editor"),
    status: memberStatus("status").notNull().default("invited"),
    invitedEmail: text("invited_email"),
    inviteToken: text("invite_token").unique(),
    inviteExpires: timestamp("invite_expires", { withTimezone: true }),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("wm_user_workspace_idx").on(t.workspaceId, t.userId),
    index("wm_workspace_idx").on(t.workspaceId),
  ]
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
