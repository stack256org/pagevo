ALTER TYPE "public"."audit_target_type" ADD VALUE 'settings';--> statement-breakpoint
CREATE TABLE "auth_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"email_password_enabled" boolean DEFAULT true NOT NULL,
	"magic_link_enabled" boolean DEFAULT true NOT NULL,
	"google_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_settings_singleton_chk" CHECK ("auth_settings"."id" = 1),
	CONSTRAINT "auth_settings_at_least_one_chk" CHECK ("auth_settings"."email_password_enabled" OR "auth_settings"."magic_link_enabled" OR "auth_settings"."google_enabled")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD CONSTRAINT "auth_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;