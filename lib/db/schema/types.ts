import { customType, pgEnum, timestamp } from "drizzle-orm/pg-core";

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const workspaceRole = pgEnum("workspace_role", [
  "admin",
  "editor",
  "viewer",
]);
export const memberStatus = pgEnum("member_status", [
  "active",
  "invited",
  "expired",
]);
export const defaultPageAccess = pgEnum("default_page_access", [
  "private",
  "can_view",
  "can_comment",
  "can_edit",
  "full_access",
]);

export const pageKind = pgEnum("page_kind", ["page", "database", "entry"]);
export const fontFamily = pgEnum("font_family", ["default", "serif", "mono"]);

export const blockType = pgEnum("block_type", [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "toggle",
  "quote",
  "callout",
  "divider",
  "todo",
  "image",
  "video",
  "audio",
  "file",
  "toc",
  "table",
  "columns",
  "code",
  "equation",
  "linked_page",
  "database",
  "template_button",
  "pdf",
  "embed",
  "bookmark",
  "breadcrumb",
  "synced_block",
  "sub_page",
]);

export const viewType = pgEnum("view_type", [
  "table",
  "board",
  "calendar",
  "gallery",
  "gantt",
]);
export const galleryCardSize = pgEnum("gallery_card_size", [
  "small",
  "medium",
  "large",
]);
export const entryOpenMode = pgEnum("entry_open_mode", [
  "side_panel",
  "full_page",
]);
export const filterLogicType = pgEnum("filter_logic_type", ["and", "or"]);

export const propertyType = pgEnum("property_type", [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "relation",
  "rollup",
  "formula",
  "created_by",
  "files",
]);

export const accessLevel = pgEnum("access_level", [
  "full_access",
  "can_edit",
  "can_comment",
  "can_view",
]);
export const publicAccessLevel = pgEnum("public_access_level", [
  "can_view",
  "can_comment",
]);
export const guestAccessLevel = pgEnum("guest_access_level", [
  "can_view",
  "can_comment",
  "can_edit",
]);

export const notificationType = pgEnum("notification_type", [
  "mention",
  "comment",
  "reply",
  "resolved",
  "reopened",
  "access_granted",
  "workspace_invite",
  "workspace_invite_accepted",
  "guest_accepted",
  "trash_warning",
  "page_update",
  "task_assigned",
  "reminder",
  "page_created",
  "role_changed",
]);
export const emailFrequency = pgEnum("email_frequency", [
  "realtime",
  "daily",
  "weekly",
  "off",
]);
export const emailOutboxStatus = pgEnum("email_outbox_status", [
  "queued",
  "sending",
  "sent",
  "failed",
]);
export const emailOutboxType = pgEnum("email_outbox_type", [
  "notification_email",
  "digest_email",
]);

export const templateStatus = pgEnum("template_status", [
  "draft",
  "published",
  "archived",
]);

export const searchSourceType = pgEnum("search_source_type", [
  "page",
  "entry",
  "comment",
]);
export const auditTargetType = pgEnum("audit_target_type", [
  "user",
  "workspace",
  "settings",
  "template",
  "email",
]);

export const fileUploadKind = pgEnum("file_upload_kind", [
  "page_cover",
  "page_icon",
  "block_media",
  "user_avatar",
  "workspace_icon",
  "database_file",
  // Built-in template assets are platform-level, not workspace-owned: the URL
  // is copied into every page created from the template, so it must survive
  // any single workspace being deleted.
  "template_cover",
]);
