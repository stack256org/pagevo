CREATE TYPE "public"."filter_logic_type" AS ENUM('and', 'or');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'page_update';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'task_assigned';--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."template_category";--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('productivity', 'project_mgmt', 'marketing', 'engineering', 'sales');--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "category" SET DATA TYPE "public"."template_category" USING "category"::"public"."template_category";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "reactions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "database_views" ADD COLUMN "filter_logic" "filter_logic_type" DEFAULT 'and' NOT NULL;