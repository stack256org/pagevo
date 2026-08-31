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
import { pages } from "./pages";
import {
  accessLevel,
  guestAccessLevel,
  publicAccessLevel,
  updatedAt,
} from "./types";
import { workspaces } from "./workspace";

export const pagePermissions = pgTable(
  "page_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestEmail: text("guest_email"),
    accessLevel: accessLevel("access_level").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("page_permissions_page_idx").on(t.pageId),
    uniqueIndex("page_permissions_page_user_idx").on(t.pageId, t.userId),
    uniqueIndex("page_permissions_page_guest_idx").on(t.pageId, t.guestEmail),
  ]
);

export const publicLinks = pgTable("public_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .unique()
    .references(() => pages.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  accessLevel: publicAccessLevel("access_level").notNull().default("can_view"),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export const guestInvitations = pgTable(
  "guest_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessLevel: guestAccessLevel("access_level").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_invitations_page_idx").on(t.pageId),
    uniqueIndex("guest_invitations_token_idx").on(t.token),
  ]
);

export type PagePermission = typeof pagePermissions.$inferSelect;
export type PublicLink = typeof publicLinks.$inferSelect;
export type GuestInvitation = typeof guestInvitations.$inferSelect;
