ALTER TYPE "public"."notification_type" ADD VALUE 'reminder';--> statement-breakpoint
CREATE TABLE "entry_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_reminders" ADD CONSTRAINT "entry_reminders_entry_id_pages_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reminders" ADD CONSTRAINT "entry_reminders_property_id_database_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."database_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reminders" ADD CONSTRAINT "entry_reminders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reminders" ADD CONSTRAINT "entry_reminders_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_reminders_entry_prop_idx" ON "entry_reminders" USING btree ("entry_id","property_id");--> statement-breakpoint
CREATE INDEX "entry_reminders_due_idx" ON "entry_reminders" USING btree ("remind_at","notified");