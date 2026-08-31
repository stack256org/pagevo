import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { updatedAt } from "./types";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Kept alongside isPlatformAdmin for Better Auth admin plugin compatibility (Phase 2 removes it)
  role: text("role").notNull().default("user"),
  jobTitle: text("job_title"),
  timezone: text("timezone"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  banned: boolean("banned").notNull().default(false),
  bannedReason: text("banned_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  onboardingStep: integer("onboarding_step").notNull().default(0),
  tourCompleted: boolean("tour_completed").notNull().default(false),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: uuid("impersonated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    impersonatedAt: timestamp("impersonated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    // Hashed password — only set on the row where providerId = "credential"
    // (Better Auth's email+password sign-up/sign-in).
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)]
);

// Singleton row (id always 1) — one operator, not per-workspace auth policy.
// Enforced server-side in lib/auth/index.ts's `hooks.before`, not just the UI.
export const authSettings = pgTable(
  "auth_settings",
  {
    id: integer("id").primaryKey().default(1),
    emailPasswordEnabled: boolean("email_password_enabled")
      .notNull()
      .default(true),
    magicLinkEnabled: boolean("magic_link_enabled").notNull().default(true),
    googleEnabled: boolean("google_enabled").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("auth_settings_singleton_chk", sql`${t.id} = 1`),
    check(
      "auth_settings_at_least_one_chk",
      sql`${t.emailPasswordEnabled} OR ${t.magicLinkEnabled} OR ${t.googleEnabled}`
    ),
  ]
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
export type AuthSettings = typeof authSettings.$inferSelect;
