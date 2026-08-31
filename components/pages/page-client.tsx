"use client";

import { ImageIcon, MessageCircle, Smile } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EntryPropertiesPanel } from "@/components/database/entry-properties-panel";
import { PageEditor } from "@/components/editor/editor";
import { IconPicker } from "@/components/pages/icon-picker";
import { PageCommentsSection } from "@/components/pages/page-comments-section";
import { usePageDraft } from "@/components/pages/page-draft-context";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { onCommentsChanged } from "@/lib/comments/comment-events";
import { useUpload } from "@/lib/storage/use-upload";

interface PageClientProps {
  currentUserId?: string;
  databaseId?: string | null;
  fontFamily: "default" | "serif" | "mono";
  initialCoverPosition: number;
  initialCoverUrl: string | null;
  initialIcon: string | null;
  initialTitle: string;
  isAdmin?: boolean;
  isDeleted: boolean;
  isEditor: boolean;
  isFullWidth: boolean;
  isLocked: boolean;
  isSmallText: boolean;
  pageId: string;
  shortId: string;
  statusBanner: React.ReactNode;
  workspaceId: string;
  workspaceSlug: string;
}

export function PageClient({
  pageId,
  shortId,
  initialTitle,
  initialIcon,
  initialCoverUrl,
  initialCoverPosition,
  isLocked,
  isDeleted,
  isEditor,
  workspaceId,
  workspaceSlug,
  fontFamily,
  isSmallText,
  isFullWidth,
  statusBanner,
  databaseId,
  currentUserId = "",
  isAdmin = false,
}: PageClientProps) {
  const router = useRouter();
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl);
  const [coverPos] = useState<number>(initialCoverPosition);
  const [removeCoverConfirm, setRemoveCoverConfirm] = useState(false);
  const [icon, setIcon] = useState<string | null>(initialIcon);
  const [showPicker, setShowPicker] = useState(false);
  // Shared by both icon-trigger buttons below (never rendered at the same
  // time) — passed to IconPicker so its outside-click-to-close doesn't treat
  // a second click on this same button as "outside," which would otherwise
  // close it and then immediately reopen it via the button's own toggle.
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  // Hidden by default, matching Notion — only revealed via "Add comment", or
  // automatically if the page already has an existing page-level thread (so
  // comments already there don't disappear behind an extra click on reload).
  const [showComments, setShowComments] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const titleRef = useRef<HTMLDivElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMount = useRef(false);
  const coverInput = useRef<HTMLInputElement>(null);

  const editable = isEditor && !isLocked && !isDeleted;

  const { upload, uploading: coverUploading } = useUpload({
    kind: "page_cover",
    workspaceId,
    pageId,
  });

  const { setIsDraft } = usePageDraft();

  useEffect(() => {
    if (!didMount.current && titleRef.current) {
      titleRef.current.textContent = initialTitle || "";
      didMount.current = true;
    }
    // Listing initialTitle is inert — the didMount guard already limits the body
    // to the first run, so a later title change re-enters and no-ops.
  }, [initialTitle]);

  const saveTitle = useCallback(
    async (raw: string) => {
      const title = raw.trim() || "Untitled";
      setSaveState("saving");
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
      try {
        const res = await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (res.ok) {
          const updated = await res.json();
          if (updated.isDraft === false) {
            setIsDraft(false);
          }
        }
        document.title = `${title} | PAGEVO`;
        setSaveState("saved");
        savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        window.dispatchEvent(
          new CustomEvent("pagevo:page-title-changed", {
            detail: { pageId, title },
          })
        );
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        router.refresh();
      } catch {
        setSaveState("idle");
      }
    },
    [pageId, router, setIsDraft]
  );

  const saveIcon = useCallback(
    async (emoji: string | null) => {
      setIcon(emoji);
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon: emoji }),
      });
      window.dispatchEvent(
        new CustomEvent("pagevo:page-title-changed", {
          detail: { pageId, icon: emoji },
        })
      );
      window.dispatchEvent(new CustomEvent("pages:refresh"));
      router.refresh();
    },
    [pageId, router]
  );

  const saveCover = useCallback(
    async (url: string | null) => {
      setCoverUrl(url);
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverUrl: url }),
      });
    },
    [pageId]
  );

  // Only set when the section is opened by the user actually clicking "Add
  // comment" — never when it reveals itself because the page already has
  // threads (recheck/handleActiveCountChange below), which on load would
  // otherwise yank the caret out of the document and into the comment box.
  const [focusComposer, setFocusComposer] = useState(false);

  // useCallback so the "show page comments" listener below can depend on it —
  // it only touches setState and the DOM, so it never actually changes.
  const revealComments = useCallback(() => {
    setShowComments(true);
    setFocusComposer(true);
    requestAnimationFrame(() => {
      document
        .getElementById("page-comments-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Instant, no-refetch path: CommentCard reports this synchronously from its
  // own optimistic update. recheck() below is just the eventual-consistency fallback.
  function handleActiveCountChange(count: number) {
    setShowComments(count > 0);
  }

  // Keep the section visible only while an active page-level thread exists;
  // re-checks on every comment mutation anywhere on the page, not just on mount.
  useEffect(() => {
    function recheck() {
      fetch(`/api/pages/${pageId}/comments`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const threads = (data?.comments ?? []) as Array<{
            blockId: string | null;
            propertyId: string | null;
            deletedAt: string | null;
            isResolved: boolean;
          }>;
          const hasActive = threads.some(
            (t) => !t.blockId && !t.propertyId && !t.deletedAt && !t.isResolved
          );
          setShowComments(hasActive);
        })
        .catch(() => {});
    }
    recheck();
    return onCommentsChanged(pageId, recheck);
  }, [pageId]);

  // The topbar "Comments" sheet (PageCommentButton) jumps here for page-level
  // threads — it can't just scrollIntoView a section that isn't rendered yet.
  useEffect(() => {
    function onJump(e: Event) {
      const detail = (e as CustomEvent<{ pageId: string }>).detail;
      if (detail?.pageId === pageId) {
        revealComments();
      }
    }
    window.addEventListener("pagevo:show-page-comments", onJump);
    return () =>
      window.removeEventListener("pagevo:show-page-comments", onJump);
  }, [pageId, revealComments]);

  async function onCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    const result = await upload(file);
    if (result) {
      saveCover(result.fileUrl);
    }
  }

  const contentCls = isFullWidth
    ? "max-w-full px-4 sm:px-8 lg:px-12"
    : "max-w-195 px-4 sm:px-8 lg:px-14";

  return (
    <div className="flex-1 overflow-y-auto" id="page-scroll-container">
      {/* ── Cover ── */}
      {coverUrl && (
        <div className="group/cover relative h-65 w-full shrink-0 overflow-hidden bg-base-200">
          <div
            className="absolute inset-0 bg-cover bg-center transition-[background-position] duration-300"
            style={{
              backgroundImage: `url(${coverUrl})`,
              backgroundPosition: `center ${coverPos * 100}%`,
            }}
          />
          {editable && (
            <div className="absolute bottom-3 right-4 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/cover:opacity-100">
              <button
                className="rounded-sm border border-base-300 bg-base-100/80 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors duration-150 hover:bg-base-100 disabled:opacity-50"
                disabled={coverUploading}
                onClick={() => coverInput.current?.click()}
                type="button"
              >
                {coverUploading ? "Uploading…" : "Change cover"}
              </button>
              <button
                className="rounded-sm border border-base-300 bg-base-100/80 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors duration-150 hover:bg-base-100"
                onClick={() => setRemoveCoverConfirm(true)}
                type="button"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Remove"
        description="This removes the cover photo from this page. You can add a new one anytime."
        onConfirm={() => saveCover(null)}
        onOpenChange={setRemoveCoverConfirm}
        open={removeCoverConfirm}
        title="Remove cover image?"
      />

      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onCoverFile}
        ref={coverInput}
        type="file"
      />

      {/* ── Page content ── */}
      <div
        className={`group/page mx-auto pb-32 ${contentCls}`}
        style={{ paddingTop: coverUrl ? (icon ? 0 : "2rem") : "4rem" }}
      >
        {/* Icon — center of icon sits on cover bottom edge, exactly like Notion */}
        {icon && (
          <div
            className={`relative mb-2 ${showPicker ? "z-600" : "z-10"}`}
            style={{ marginTop: coverUrl ? "-2.5rem" : 0 }}
          >
            <button
              aria-label="Change icon"
              className="inline-flex cursor-pointer rounded-sm p-1 leading-none outline-none transition-colors duration-150 hover:bg-black/6 dark:hover:bg-white/8 disabled:cursor-default"
              disabled={!editable}
              onClick={() => editable && setShowPicker((p) => !p)}
              ref={iconBtnRef}
              type="button"
            >
              <PageIcon icon={icon} size={72} />
            </button>
            {showPicker && (
              <IconPicker
                onClose={() => setShowPicker(false)}
                onIconPreview={(v) => saveIcon(v)}
                onRemove={() => {
                  setShowPicker(false);
                  saveIcon(null);
                }}
                onSelect={(v) => {
                  setShowPicker(false);
                  saveIcon(v);
                }}
                pageId={pageId}
                triggerRef={iconBtnRef}
                workspaceId={workspaceId}
              />
            )}
          </div>
        )}

        {/* Page toolbar — Add cover / Add icon / Add comment */}
        {editable && (
          <div
            className={`flex items-center gap-1 transition-opacity duration-150 ${showPicker ? "opacity-100" : "opacity-0 group-hover/page:opacity-100"} ${icon ? "mb-3" : "mb-4"}`}
          >
            {!coverUrl && (
              <button
                className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:opacity-40"
                disabled={coverUploading}
                onClick={() => coverInput.current?.click()}
                type="button"
              >
                <ImageIcon size={13} />
                {coverUploading ? "Uploading…" : "Add cover"}
              </button>
            )}
            {!icon && (
              <div className="relative">
                <button
                  className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                  onClick={() => setShowPicker((p) => !p)}
                  ref={iconBtnRef}
                  type="button"
                >
                  <Smile size={13} />
                  Add icon
                </button>
                {showPicker && (
                  <IconPicker
                    onClose={() => setShowPicker(false)}
                    onIconPreview={(v) => saveIcon(v)}
                    onSelect={(v) => {
                      setShowPicker(false);
                      saveIcon(v);
                    }}
                    pageId={pageId}
                    triggerRef={iconBtnRef}
                    workspaceId={workspaceId}
                  />
                )}
              </div>
            )}
            {!showComments && (
              <button
                className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                onClick={revealComments}
                type="button"
              >
                <MessageCircle size={13} />
                Add comment
              </button>
            )}
          </div>
        )}

        {statusBanner}

        {/* Title + save indicator */}
        <div className="relative mt-1">
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: false positive — contentEditable already makes this element focusable, keyboard-operable and exposed as a textbox to assistive tech; the browser provides the semantics a role would. The handlers here (onInput/onBlur) are text-editing events, not click activations. Biome's a11y rules do not model contentEditable. */}
          <div
            className={[
              "w-full wrap-break-word text-[2.5rem] font-bold leading-[1.2] tracking-tight text-base-content outline-none",
              "empty:before:content-[attr(data-placeholder)] empty:before:text-base-content/70",
              editable ? "cursor-text" : "cursor-default select-text",
            ].join(" ")}
            contentEditable={editable}
            data-placeholder="Untitled"
            onBlur={(e) => {
              if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
              }
              saveTitle(e.currentTarget.textContent ?? "");
            }}
            onInput={(e) => {
              const text = e.currentTarget.textContent ?? "";
              // Breadcrumbs/mentions update on every keystroke, not just once the
              // debounced save (below) actually PATCHes the server — matches Notion,
              // where the crumb visibly follows what you're typing in real time.
              window.dispatchEvent(
                new CustomEvent("pagevo:page-title-changed", {
                  detail: { pageId, title: text },
                })
              );
              if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
              }
              saveTimeout.current = setTimeout(() => saveTitle(text), 800);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                titleRef.current?.blur();
              }
            }}
            ref={titleRef}
            suppressContentEditableWarning
          />
          <div className="absolute -top-7 right-0">
            <SaveStatusIndicator state={saveState} />
          </div>
        </div>

        {/* Database entry properties — shown above comments for entries opened
        in full page (Priority/Category/Votes etc. before the comment box),
        unlike a plain page's comment section, which has no properties to
        lead with. */}
        {databaseId && (
          <EntryPropertiesPanel
            databaseId={databaseId}
            entryId={pageId}
            entryShortId={shortId}
            isEditor={isEditor && !isLocked && !isDeleted}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
        )}

        {/* Page-level comments — Notion-style, shown right below the title (and
        below any entry properties) and above the page's own content. Hidden
        until "Add comment" is used (or already has a thread), rather than
        always showing an empty section. */}
        {showComments && (
          <div className="mt-4">
            <PageCommentsSection
              autoFocusComposer={focusComposer}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onActiveCountChange={handleActiveCountChange}
              onDismiss={() => {
                setShowComments(false);
                setFocusComposer(false);
              }}
              pageId={pageId}
              workspaceId={workspaceId}
            />
          </div>
        )}

        {/* Editor */}
        <div className="mt-3">
          <PageEditor
            currentUserId={currentUserId}
            fontFamily={fontFamily}
            isAdmin={isAdmin}
            isDeleted={isDeleted}
            isEditor={isEditor}
            isLocked={isLocked}
            isSmallText={isSmallText}
            pageId={pageId}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </div>
    </div>
  );
}
