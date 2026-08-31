ALTER TABLE "notification_preferences" ADD COLUMN "notify_mentions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "notify_page_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "notify_workspace_invites" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "notify_task_assignments" boolean DEFAULT true NOT NULL;