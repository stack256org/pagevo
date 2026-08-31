ALTER TABLE "file_uploads" DROP CONSTRAINT "file_uploads_avatar_workspace_chk";--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_avatar_workspace_chk" CHECK ((kind IN ('user_avatar', 'template_cover') AND workspace_id IS NULL) OR (kind NOT IN ('user_avatar', 'template_cover') AND workspace_id IS NOT NULL));
