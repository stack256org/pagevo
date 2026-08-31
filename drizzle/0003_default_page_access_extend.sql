ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'can_view';
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'can_comment';
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'can_edit';
ALTER TYPE "default_page_access" ADD VALUE IF NOT EXISTS 'full_access';
