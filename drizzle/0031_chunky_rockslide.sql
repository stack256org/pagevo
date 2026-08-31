CREATE TABLE "integration_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_user" text,
	"smtp_pass_encrypted" text,
	"email_from" text,
	"google_client_id" text,
	"google_client_secret_encrypted" text,
	"storage_driver" text,
	"s3_endpoint" text,
	"s3_bucket" text,
	"s3_region" text,
	"s3_access_key_id" text,
	"s3_secret_access_key_encrypted" text,
	"cdn_url" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_settings_singleton_chk" CHECK ("integration_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;