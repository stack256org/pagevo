ALTER TABLE "templates" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."template_category";