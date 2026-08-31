"use client";

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { ImageIcon, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useUpload } from "@/lib/storage/use-upload";
import { EmojiGridPicker } from "./emoji-grid-picker";
import { ICON_REGISTRY, PageIcon } from "./page-icon";

// ── Icon colors ───────────────────────────────────────────────────────────────

const ICON_COLORS = [
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Navy", value: "#0C2340" },
  { name: "Black", value: "#1a1a1a" },
];

const ICON_NAMES = Object.keys(ICON_REGISTRY);

const TABS = ["emoji", "icons", "upload"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  emoji: "Emoji",
  icons: "Icons",
  upload: "Upload",
};

// Shared by both the outer Emoji/Icons/Upload bar and the inner Upload-tab's
// file/link bar — same Notion-style underline-on-select tab button.
const TAB_BTN_CLASS = [
  "relative px-3 py-2.5 text-xs font-medium text-base-content/70 outline-none transition-colors",
  "hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  "data-selected:text-base-content data-selected:after:absolute data-selected:after:bottom-0 data-selected:after:left-0",
  "data-selected:after:right-0 data-selected:after:h-0.5 data-selected:after:bg-base-content data-selected:after:content-['']",
].join(" ");

// ── Props ─────────────────────────────────────────────────────────────────────

export interface IconPickerProps {
  onClose: () => void;
  onIconPreview?: (value: string) => void;
  onRemove?: () => void;
  onSelect: (value: string) => void;
  pageId?: string;
  /** The button that opens/toggles this picker — CloseWatcher uses this ref to recognize a second
   *  click on it (which Headless UI would otherwise treat as an outside click) and skip onClose, see doc/bugs/2026-07-31-*-icon-picker-toggle-doesnt-close.md. */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Which upload-quota bucket an uploaded image counts against — defaults to
   *  "page_icon" (this picker's original, only use case); pass "workspace_icon"
   *  when reusing this same picker for a workspace's own icon instead of a page's. */
  uploadKind?: "page_icon" | "workspace_icon";
  workspaceId?: string;
}

// Popover has no controlled open prop, but IconPicker is only ever mounted while it should be
// open; AutoOpener clicks a hidden PopoverButton once, synchronously before paint, to sync Headless UI's internal state.
function AutoOpener({
  innerRef,
}: {
  innerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  // React Strict Mode (on by default for the app router in dev) double-invokes mount
  // effects — without this guard, the 2nd invocation clicks the now-already-open button
  // again, toggling it straight back to closed before the browser ever paints, so "Add
  // icon" looks like it does nothing. Refs survive the double-invoke (only the effect
  // body re-runs), so this keeps the actual click to exactly once either way.
  const clickedRef = useRef(false);
  useLayoutEffect(() => {
    if (clickedRef.current) {
      return;
    }
    clickedRef.current = true;
    innerRef.current?.click();
  }, [innerRef]);
  return (
    // `sr-only` (1px, clipped), not `hidden` (display:none): Headless UI's PopoverPanel
    // watches its registered button via ResizeObserver/IntersectionObserver and auto-closes
    // the instant that button's rect is 0x0x0x0 (see `useOnDisappear`, its safety net for a
    // trigger that gets unmounted while open). A `display:none` button is *always* 0x0, so
    // the panel was closing itself again right after AutoOpener opened it — `sr-only` keeps
    // a real (if invisible) box so that watcher never fires.
    <PopoverButton
      aria-hidden="true"
      className="sr-only"
      ref={innerRef}
      tabIndex={-1}
      type="button"
    />
  );
}

// Bridges Headless UI's internal open state back to onClose for closes it decided on itself
// (outside click/Escape); skips the one caused by re-clicking the trigger (see triggerRef above), deferring to the caller's toggle handler.
function CloseWatcher({
  open,
  onClose,
  skipNextRef,
}: {
  open: boolean;
  onClose: () => void;
  skipNextRef: React.RefObject<boolean>;
}) {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) {
      return;
    }
    wasOpen.current = false;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    onClose();
  }, [open, onClose, skipNextRef]);
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IconPicker({
  onSelect,
  onIconPreview,
  onRemove,
  onClose,
  workspaceId,
  pageId,
  uploadKind = "page_icon",
  triggerRef,
}: IconPickerProps) {
  const [iconColor, setIconColor] = useState("#6b7280");
  const [iconSearch, setIconSearch] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreviewOk, setLinkPreviewOk] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const autoOpenBtnRef = useRef<HTMLButtonElement>(null);
  const skipNextCloseRef = useRef(false);
  useEffect(() => {
    const el = triggerRef?.current;
    if (!el) {
      return;
    }
    const mark = () => {
      skipNextCloseRef.current = true;
    };
    el.addEventListener("pointerdown", mark);
    return () => el.removeEventListener("pointerdown", mark);
  }, [triggerRef]);

  const {
    upload,
    uploading,
    error: uploadError,
  } = useUpload({ kind: uploadKind, workspaceId, pageId });

  const filteredIcons = iconSearch.trim()
    ? ICON_NAMES.filter((n) =>
        n.toLowerCase().includes(iconSearch.trim().toLowerCase())
      )
    : ICON_NAMES;

  async function handleUpload(file: File) {
    const res = await upload(file);
    if (res) {
      setUploadedUrl(res.fileUrl);
      const iconJson = JSON.stringify({ type: "image", url: res.fileUrl });
      if (onIconPreview) {
        onIconPreview(iconJson);
      }
    }
  }

  function applyImage(url: string) {
    onSelect(JSON.stringify({ type: "image", url }));
    onClose();
  }

  function applyLinkUrl() {
    const trimmed = linkUrl.trim();
    if (!trimmed || !linkPreviewOk) {
      return;
    }
    applyImage(trimmed);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) {
      handleUpload(file);
    }
  }

  return (
    <>
      <Popover onClick={(e) => e.stopPropagation()}>
        {({ open }) => (
          <>
            <AutoOpener innerRef={autoOpenBtnRef} />
            <CloseWatcher
              onClose={onClose}
              open={open}
              skipNextRef={skipNextCloseRef}
            />
            <PopoverPanel className="absolute left-0 top-full z-500 mt-2 w-88 overflow-hidden rounded-lg border border-base-300 bg-neutral">
              <TabGroup>
                {/* ── Tab bar — Notion underline style ── */}
                <div className="flex items-center border-b border-base-300 px-2">
                  <TabList className="flex items-center">
                    {TABS.map((id) => (
                      <Tab className={TAB_BTN_CLASS} key={id}>
                        {TAB_LABELS[id]}
                      </Tab>
                    ))}
                  </TabList>
                  <div className="flex-1" />
                  {onRemove && (
                    <button
                      className="px-2 py-1.5 text-xs text-base-content/70 transition-colors hover:text-error"
                      onClick={() => {
                        onRemove();
                        onClose();
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <TabPanels>
                  {/* ── Emoji tab ── */}
                  <TabPanel>
                    <EmojiGridPicker
                      onClose={onClose}
                      onSelect={onSelect}
                      // Shuffle updates the icon but keeps the picker open so the user can browse repeatedly;
                      // routed through onIconPreview (same callback the upload tab uses) when supported, else falls back to select-and-close.
                      onShuffle={(emoji) => {
                        if (onIconPreview) {
                          onIconPreview(emoji);
                        } else {
                          onSelect(emoji);
                          onClose();
                        }
                      }}
                    />
                  </TabPanel>

                  {/* ── Icons tab ── */}
                  <TabPanel className="flex flex-col">
                    <div className="px-3 pb-2 pt-2.5">
                      <div className="relative">
                        <Search
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/50"
                          size={13}
                        />
                        <input
                          autoFocus
                          className="w-full rounded-sm border border-base-300 bg-base-200 py-1.5 pl-7 pr-2.5 text-sm text-base-content outline-none placeholder:text-base-content/50 focus:border-primary/50"
                          onChange={(e) => setIconSearch(e.target.value)}
                          placeholder="Search icons…"
                          value={iconSearch}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-b border-base-300 px-3 pb-2.5">
                      {ICON_COLORS.map((c) => (
                        <button
                          className="relative flex shrink-0 items-center justify-center transition-transform hover:scale-110"
                          key={c.value}
                          onClick={() => setIconColor(c.value)}
                          onMouseEnter={(e) => showTooltip(c.name, e)}
                          onMouseLeave={hideTooltip}
                          style={{ width: 20, height: 20 }}
                          type="button"
                        >
                          <span
                            className={[
                              "block rounded-full transition-all",
                              iconColor === c.value
                                ? "size-5 ring-2 ring-offset-1 ring-base-content/40"
                                : "size-4",
                            ].join(" ")}
                            style={{ backgroundColor: c.value }}
                          />
                        </button>
                      ))}
                    </div>
                    <div className="h-50 overflow-y-auto px-2.5 py-2">
                      {filteredIcons.length === 0 ? (
                        <p className="py-8 text-center text-xs text-base-content/70">
                          No icons found
                        </p>
                      ) : (
                        <div className="grid grid-cols-9 gap-0.5">
                          {filteredIcons.map((name) => (
                            <button
                              className="flex size-9 items-center justify-center rounded-sm transition-colors hover:bg-base-200"
                              key={name}
                              onClick={() => {
                                onSelect(
                                  JSON.stringify({
                                    type: "icon",
                                    name,
                                    color: iconColor,
                                  })
                                );
                                onClose();
                              }}
                              onMouseEnter={(e) => showTooltip(name, e)}
                              onMouseLeave={hideTooltip}
                              type="button"
                            >
                              <PageIcon
                                icon={JSON.stringify({
                                  type: "icon",
                                  name,
                                  color: iconColor,
                                })}
                                size={18}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabPanel>

                  {/* ── Upload tab ── */}
                  <TabPanel className="flex flex-col">
                    <TabGroup>
                      <TabList className="flex gap-0 border-b border-base-300 px-3">
                        <Tab className={TAB_BTN_CLASS}>Upload file</Tab>
                        <Tab className={TAB_BTN_CLASS}>Link</Tab>
                      </TabList>

                      <TabPanels>
                        {/* Upload file */}
                        <TabPanel className="p-3">
                          <input
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUpload(file);
                              }
                              e.target.value = "";
                            }}
                            ref={fileRef}
                            type="file"
                          />
                          {uploadedUrl ? (
                            <div className="flex flex-col items-center gap-4 py-3">
                              {/* biome-ignore lint/performance/noImgElement: src is an arbitrary third-party/user-supplied URL; next/image would need a wildcard remotePatterns entry */}
                              <img
                                alt="Icon preview"
                                className="size-18 rounded-sm border border-base-300 object-cover"
                                src={uploadedUrl}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-sm bg-primary px-4 py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90"
                                  onClick={() => applyImage(uploadedUrl)}
                                  type="button"
                                >
                                  Apply
                                </button>
                                <button
                                  className="rounded-sm border border-base-300 px-3 py-1.5 text-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-50"
                                  disabled={uploading}
                                  onClick={() => fileRef.current?.click()}
                                  type="button"
                                >
                                  {uploading ? "Uploading…" : "Change"}
                                </button>
                              </div>
                              {uploadError && (
                                <p className="text-xs text-error">
                                  {uploadError}
                                </p>
                              )}
                            </div>
                          ) : (
                            // A real <button>: its whole job is "open the file
                            // picker", so keyboard users get Enter/Space for
                            // free. Drop targets work the same on a button, and
                            // the labels are <span className="block"> rather
                            // than <p> because a button may only contain
                            // phrasing content.
                            <button
                              className={[
                                "flex w-full cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed py-8 transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                isDragging
                                  ? "border-primary bg-primary/5 text-base-content"
                                  : "border-base-300 text-base-content/70 hover:border-primary/40 hover:bg-base-200/20 hover:text-base-content",
                                uploading
                                  ? "pointer-events-none opacity-60"
                                  : "",
                              ].join(" ")}
                              onClick={() => fileRef.current?.click()}
                              onDragLeave={() => setIsDragging(false)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                              }}
                              onDrop={onDrop}
                              type="button"
                            >
                              <ImageIcon className="opacity-50" size={22} />
                              <span className="block text-center">
                                <span className="block text-sm font-medium">
                                  {uploading ? "Uploading…" : "Choose an image"}
                                </span>
                                <span className="mt-0.5 block text-xs opacity-60">
                                  or drag & drop · PNG, JPG, GIF, WebP
                                </span>
                              </span>
                            </button>
                          )}
                        </TabPanel>

                        {/* Link */}
                        <TabPanel className="flex flex-col gap-3 p-3">
                          <input
                            autoFocus
                            className="w-full rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content outline-none placeholder:text-base-content/50 focus:border-primary/60"
                            onChange={(e) => {
                              setLinkUrl(e.target.value);
                              setLinkPreviewOk(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && linkPreviewOk) {
                                applyLinkUrl();
                              }
                            }}
                            placeholder="Paste image URL…"
                            value={linkUrl}
                          />
                          {linkUrl.trim() && (
                            <div className="flex items-center gap-3">
                              {/* biome-ignore lint/performance/noImgElement: src is an arbitrary third-party/user-supplied URL; next/image would need a wildcard remotePatterns entry */}
                              {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError/onLoad are browser resource-lifecycle events, not user interactions — they drive the "is this URL a valid image?" indicator next to the field. There is nothing here for a keyboard or screen-reader user to reach. */}
                              <img
                                alt="Preview"
                                className={`size-12 rounded-xs border object-cover transition-opacity ${linkPreviewOk ? "border-base-300 opacity-100" : "opacity-0"}`}
                                onError={() => setLinkPreviewOk(false)}
                                onLoad={() => setLinkPreviewOk(true)}
                                src={linkUrl.trim()}
                              />
                              {linkPreviewOk ? (
                                <span className="text-xs text-base-content/70">
                                  Preview
                                </span>
                              ) : (
                                <span className="text-xs text-error">
                                  Not a valid image URL
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!linkPreviewOk}
                            onClick={applyLinkUrl}
                            type="button"
                          >
                            Apply
                          </button>
                        </TabPanel>
                      </TabPanels>
                    </TabGroup>
                  </TabPanel>
                </TabPanels>
              </TabGroup>
            </PopoverPanel>
          </>
        )}
      </Popover>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
