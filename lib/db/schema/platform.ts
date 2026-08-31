import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { auditTargetType } from "./types";

export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: auditTargetType("target_type").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("platform_audit_log_actor_idx").on(t.actorId),
    index("platform_audit_log_created_idx").on(t.createdAt),
  ]
);

export type PlatformAuditLog = typeof platformAuditLog.$inferSelect;
