ALTER TYPE "public"."view_type" ADD VALUE 'gantt';--> statement-breakpoint
ALTER TABLE "database_views" ADD COLUMN "gantt_start_property_id" uuid;--> statement-breakpoint
ALTER TABLE "database_views" ADD COLUMN "gantt_end_property_id" uuid;--> statement-breakpoint
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_gantt_start_property_id_database_properties_id_fk" FOREIGN KEY ("gantt_start_property_id") REFERENCES "public"."database_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_gantt_end_property_id_database_properties_id_fk" FOREIGN KEY ("gantt_end_property_id") REFERENCES "public"."database_properties"("id") ON DELETE set null ON UPDATE no action;