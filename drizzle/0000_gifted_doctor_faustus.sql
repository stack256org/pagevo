CREATE TYPE "public"."access_level" AS ENUM('full_access', 'can_edit', 'can_comment', 'can_view');--> statement-breakpoint
CREATE TYPE "public"."audit_target_type" AS ENUM('user', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."block_type" AS ENUM('paragraph', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'toggle', 'quote', 'callout', 'divider', 'todo', 'image', 'video', 'audio', 'file', 'toc', 'table', 'columns', 'code', 'equation', 'linked_page', 'database', 'template_button');--> statement-breakpoint
CREATE TYPE "public"."default_page_access" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."email_frequency" AS ENUM('realtime', 'daily', 'weekly', 'off');--> statement-breakpoint
CREATE TYPE "public"."email_outbox_status" AS ENUM('queued', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_outbox_type" AS ENUM('notification_email', 'digest_email');--> statement-breakpoint
CREATE TYPE "public"."entry_open_mode" AS ENUM('side_panel', 'full_page');--> statement-breakpoint
CREATE TYPE "public"."file_upload_kind" AS ENUM('page_cover', 'page_icon', 'block_media', 'user_avatar', 'workspace_icon');--> statement-breakpoint
CREATE TYPE "public"."font_family" AS ENUM('default', 'serif', 'mono');--> statement-breakpoint
CREATE TYPE "public"."gallery_card_size" AS ENUM('small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."guest_access_level" AS ENUM('can_view', 'can_comment', 'can_edit');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'invited', 'expired');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('mention', 'comment', 'reply', 'resolved', 'reopened', 'access_granted', 'workspace_invite', 'guest_accepted', 'trash_warning');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('page', 'database', 'entry');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'email', 'phone', 'person', 'relation');--> statement-breakpoint
CREATE TYPE "public"."public_access_level" AS ENUM('can_view', 'can_comment');--> statement-breakpoint
CREATE TYPE "public"."search_source_type" AS ENUM('page', 'entry', 'comment');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('personal', 'productivity', 'project_mgmt', 'team', 'crm');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."view_type" AS ENUM('table', 'board', 'calendar', 'gallery');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"impersonated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"job_title" text,
	"timezone" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"banned_reason" text,
	"ban_expires" timestamp with time zone,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"tour_completed" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"block_id" uuid,
	"parent_id" uuid,
	"anchor_start" integer,
	"anchor_end" integer,
	"thread_number" integer,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"is_orphaned" boolean DEFAULT false NOT NULL,
	"author_id" uuid,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"type" "email_outbox_type" NOT NULL,
	"status" "email_outbox_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_frequency" "email_frequency" DEFAULT 'daily' NOT NULL,
	"weekly_digest_day" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sender_id" uuid,
	"type" "notification_type" NOT NULL,
	"page_id" uuid,
	"source_id" uuid,
	"content_snippet" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "property_type" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_value" jsonb,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_back_relation" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "view_type" NOT NULL,
	"group_by_property_id" uuid,
	"calendar_property_id" uuid,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sorts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"card_display_props" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden_property_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gallery_card_size" "gallery_card_size",
	"entry_open_mode" "entry_open_mode" DEFAULT 'side_panel' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"kind" "file_upload_kind" NOT NULL,
	"page_id" uuid,
	"block_id" uuid,
	"object_key" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"uploaded_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_uploads_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "file_uploads_avatar_workspace_chk" CHECK ((kind = 'user_avatar' AND workspace_id IS NULL) OR (kind != 'user_avatar' AND workspace_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "workspace_storage_usage" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"bytes_used" bigint DEFAULT 0 NOT NULL,
	"threshold_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"role" "workspace_role" DEFAULT 'editor' NOT NULL,
	"status" "member_status" DEFAULT 'invited' NOT NULL,
	"invited_email" text,
	"invite_token" text,
	"invite_expires" timestamp with time zone,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "workspace_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"old_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"default_page_access" "default_page_access" DEFAULT 'shared' NOT NULL,
	"invite_link_token" text,
	"invite_link_active" boolean DEFAULT false NOT NULL,
	"invite_link_role" "workspace_role" DEFAULT 'editor' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_invite_link_token_unique" UNIQUE("invite_link_token")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"parent_block_id" uuid,
	"type" "block_type" NOT NULL,
	"content" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"order_index" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_closure" (
	"ancestor_id" uuid NOT NULL,
	"descendant_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "page_closure_ancestor_id_descendant_id_pk" PRIMARY KEY("ancestor_id","descendant_id")
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"content_snapshot" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"label" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" varchar(12) NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "page_kind" DEFAULT 'page' NOT NULL,
	"database_id" uuid,
	"default_view_id" uuid,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"icon" text,
	"cover_url" text,
	"cover_position" real DEFAULT 0.5 NOT NULL,
	"is_full_width" boolean DEFAULT false NOT NULL,
	"font_family" "font_family" DEFAULT 'default' NOT NULL,
	"is_small_text" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"trash_warning_sent" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"last_edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
CREATE TABLE "guest_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"access_level" "guest_access_level" NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "page_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"user_id" uuid,
	"guest_email" text,
	"access_level" "access_level" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"token" text NOT NULL,
	"access_level" "public_access_level" DEFAULT 'can_view' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_links_page_id_unique" UNIQUE("page_id"),
	CONSTRAINT "public_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "search_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" "search_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text,
	"search_vector" "tsvector",
	"page_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category" "template_category" NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"status" "template_status" DEFAULT 'published' NOT NULL,
	"created_by" uuid,
	"page_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_hint_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hint_key" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"last_workspace_id" uuid,
	"sidebar_width" integer DEFAULT 240 NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_recently_visited" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" "audit_target_type" NOT NULL,
	"target_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_properties" ADD CONSTRAINT "database_properties_database_id_pages_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_database_id_pages_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_group_by_property_id_database_properties_id_fk" FOREIGN KEY ("group_by_property_id") REFERENCES "public"."database_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_calendar_property_id_database_properties_id_fk" FOREIGN KEY ("calendar_property_id") REFERENCES "public"."database_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_values" ADD CONSTRAINT "property_values_entry_id_pages_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_values" ADD CONSTRAINT "property_values_property_id_database_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."database_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage_usage" ADD CONSTRAINT "workspace_storage_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_slug_redirects" ADD CONSTRAINT "workspace_slug_redirects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_parent_block_id_blocks_id_fk" FOREIGN KEY ("parent_block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_closure" ADD CONSTRAINT "page_closure_ancestor_id_pages_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_closure" ADD CONSTRAINT "page_closure_descendant_id_pages_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_database_id_pages_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_last_edited_by_users_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_index" ADD CONSTRAINT "search_index_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_index" ADD CONSTRAINT "search_index_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hint_states" ADD CONSTRAINT "user_hint_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_last_workspace_id_workspaces_id_fk" FOREIGN KEY ("last_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recently_visited" ADD CONSTRAINT "user_recently_visited_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recently_visited" ADD CONSTRAINT "user_recently_visited_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recently_visited" ADD CONSTRAINT "user_recently_visited_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "comments_page_idx" ON "comments" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "comments_block_idx" ON "comments" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "database_properties_database_idx" ON "database_properties" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "database_views_database_idx" ON "database_views" USING btree ("database_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_values_entry_prop_idx" ON "property_values" USING btree ("entry_id","property_id");--> statement-breakpoint
CREATE INDEX "property_values_property_idx" ON "property_values" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_values_value_gin_idx" ON "property_values" USING gin ("value");--> statement-breakpoint
CREATE INDEX "file_uploads_workspace_idx" ON "file_uploads" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_uploads_object_key_idx" ON "file_uploads" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "file_uploads_confirmed_idx" ON "file_uploads" USING btree ("confirmed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wm_user_workspace_idx" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "wm_workspace_idx" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_redirects_old_slug_idx" ON "workspace_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE INDEX "blocks_page_order_idx" ON "blocks" USING btree ("page_id","order_index");--> statement-breakpoint
CREATE INDEX "blocks_parent_idx" ON "blocks" USING btree ("parent_block_id");--> statement-breakpoint
CREATE INDEX "page_closure_descendant_idx" ON "page_closure" USING btree ("descendant_id");--> statement-breakpoint
CREATE INDEX "page_versions_page_idx" ON "page_versions" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_short_id_idx" ON "pages" USING btree ("short_id");--> statement-breakpoint
CREATE INDEX "pages_workspace_idx" ON "pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pages_parent_order_idx" ON "pages" USING btree ("parent_id","order_index");--> statement-breakpoint
CREATE INDEX "pages_database_idx" ON "pages" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "pages_live_tree_idx" ON "pages" USING btree ("workspace_id","is_deleted");--> statement-breakpoint
CREATE INDEX "guest_invitations_page_idx" ON "guest_invitations" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_invitations_token_idx" ON "guest_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "page_permissions_page_idx" ON "page_permissions" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_permissions_page_user_idx" ON "page_permissions" USING btree ("page_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_permissions_page_guest_idx" ON "page_permissions" USING btree ("page_id","guest_email");--> statement-breakpoint
CREATE UNIQUE INDEX "search_index_source_idx" ON "search_index" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "search_index_workspace_idx" ON "search_index" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "search_index_vector_idx" ON "search_index" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "templates_workspace_idx" ON "templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_favorites_user_page_idx" ON "user_favorites" USING btree ("user_id","page_id");--> statement-breakpoint
CREATE INDEX "user_favorites_user_workspace_idx" ON "user_favorites" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_hint_states_user_hint_idx" ON "user_hint_states" USING btree ("user_id","hint_key");--> statement-breakpoint
CREATE INDEX "user_hint_states_user_idx" ON "user_hint_states" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "urv_user_page_idx" ON "user_recently_visited" USING btree ("user_id","page_id");--> statement-breakpoint
CREATE INDEX "urv_recent_idx" ON "user_recently_visited" USING btree ("user_id","workspace_id","visited_at");--> statement-breakpoint
CREATE INDEX "platform_audit_log_actor_idx" ON "platform_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "platform_audit_log_created_idx" ON "platform_audit_log" USING btree ("created_at");