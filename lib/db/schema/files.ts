import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { blocks, pages } from "./pages";
import { fileUploadKind, updatedAt } from "./types";
import { workspaces } from "./workspace";

export const fileUploads = pgTable(
  "file_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    kind: fileUploadKind("kind").notNull(),
    pageId: uuid("page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    blockId: uuid("block_id").references(() => blocks.id, {
      onDelete: "set null",
    }),
    objectKey: text("object_key").notNull().unique(),
    fileUrl: text("file_url").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("file_uploads_workspace_idx").on(t.workspaceId),
    uniqueIndex("file_uploads_object_key_idx").on(t.objectKey),
    index("file_uploads_confirmed_idx").on(t.confirmedAt),
    check(
      "file_uploads_avatar_workspace_chk",
      sql`(kind IN ('user_avatar', 'template_cover') AND workspace_id IS NULL) OR (kind NOT IN ('user_avatar', 'template_cover') AND workspace_id IS NOT NULL)`
    ),
  ]
);

export const workspaceStorageUsage = pgTable("workspace_storage_usage", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  bytesUsed: bigint("bytes_used", { mode: "number" }).notNull().default(0),
  thresholdNotifiedAt: timestamp("threshold_notified_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export type FileUpload = typeof fileUploads.$inferSelect;
export type WorkspaceStorageUsage = typeof workspaceStorageUsage.$inferSelect;
