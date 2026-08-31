import {
  type AnyPgColumn,
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
import { databaseProperties } from "./databases";
import { blocks, pages } from "./pages";
import {
  emailFrequency,
  emailOutboxStatus,
  emailOutboxType,
  notificationType,
  updatedAt,
} from "./types";
import { workspaces } from "./workspace";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").references(() => blocks.id, {
      onDelete: "set null",
    }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    anchorStart: integer("anchor_start"),
    anchorEnd: integer("anchor_end"),
    threadNumber: integer("thread_number"),
    isResolved: boolean("is_resolved").notNull().default(false),
    isOrphaned: boolean("is_orphaned").notNull().default(false),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    content: jsonb("content").notNull(),
    reactions: jsonb("reactions")
      .$type<Record<string, string[]>>()
      .default({})
      .notNull(),
    // Database-cell comments: which property the thread was opened from, plus a
    // frozen snapshot of the property name/value at creation time (mirrors the
    // quoted-text pattern of block comments — the label doesn't live-update if
    // the cell value later changes).
    propertyId: uuid("property_id").references(() => databaseProperties.id, {
      onDelete: "set null",
    }),
    propertyName: text("property_name"),
    propertyValueLabel: text("property_value_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("comments_page_idx").on(t.pageId),
    index("comments_block_idx").on(t.blockId),
    index("comments_parent_idx").on(t.parentId),
    index("comments_property_idx").on(t.propertyId),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: notificationType("type").notNull(),
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id"),
    contentSnippet: text("content_snippet"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_recipient_idx").on(t.recipientId),
    index("notifications_recipient_unread_idx").on(t.recipientId, t.isRead),
    index("notifications_created_idx").on(t.createdAt),
  ]
);

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  emailFrequency: emailFrequency("email_frequency").notNull().default("daily"),
  weeklyDigestDay: integer("weekly_digest_day").notNull().default(1),
  // Per-category opt-outs — gate which notification types generate emails
  // (realtime sends and digests); in-app notifications are unaffected.
  notifyMentions: boolean("notify_mentions").notNull().default(true),
  notifyPageUpdates: boolean("notify_page_updates").notNull().default(true),
  notifyWorkspaceInvites: boolean("notify_workspace_invites")
    .notNull()
    .default(true),
  notifyTaskAssignments: boolean("notify_task_assignments")
    .notNull()
    .default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientEmail: text("recipient_email").notNull(),
    subject: text("subject").notNull(),
    htmlBody: text("html_body").notNull(),
    type: emailOutboxType("type").notNull(),
    status: emailOutboxStatus("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [index("email_outbox_status_idx").on(t.status)]
);

export type Comment = typeof comments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type NewEmailOutbox = typeof emailOutbox.$inferInsert;
