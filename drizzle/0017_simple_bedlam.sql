CREATE TABLE "template_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_category_id_template_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."template_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "templates_category_idx" ON "templates" USING btree ("category_id");--> statement-breakpoint
-- Data backfill (hand-added, not drizzle-kit generated): seed the categories
-- table with the 5 values the old enum allowed, then point every existing
-- template's new category_id at the matching row. Step 2 of this migration
-- (a later schema change) drops the old "category" enum column once this
-- has run and makes category_id NOT NULL.
INSERT INTO "template_categories" ("key", "label", "order_index") VALUES
	('productivity', 'Productivity', 0),
	('project_mgmt', 'Project Management', 1),
	('marketing', 'Marketing & Content', 2),
	('engineering', 'Engineering & Docs', 3),
	('sales', 'Sales & Finance', 4);
--> statement-breakpoint
UPDATE "templates" SET "category_id" = (SELECT "id" FROM "template_categories" WHERE "template_categories"."key" = "templates"."category"::text);