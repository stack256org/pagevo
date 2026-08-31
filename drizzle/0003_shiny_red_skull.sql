ALTER TABLE "comments" ADD COLUMN "property_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "property_name" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "property_value_label" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_property_id_database_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."database_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_property_idx" ON "comments" USING btree ("property_id");
