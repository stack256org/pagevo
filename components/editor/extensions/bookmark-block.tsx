"use client";

import type { NodeViewProps } from "@tiptap/react";
import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import {
  Download as DownloadIcon,
  FileIcon,
  Maximize2,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LinkPreview } from "@/app/api/link-preview/route";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useUpload } from "@/lib/storage/use-upload";

// ── Shared URL picker (unresolved state) — mirrors media-blocks.tsx's
// MediaPicker visual language (module-private there, so a small copy here
// rather than exporting/importing across files for one shared bit). ──────────
function UrlPicker({
  icon,
  label,
  placeholder,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  icon: string;
  label: string;
  placeholder: string;
  loading: boolean;
  error: string | null;
  onConfirm: (url: string) => void;
  onCancel?: () => void;
}) {
  const [url, setUrl] = useState("");
  return (
    <div className="my-2 space-y-3 rounded-md border border-base-300 bg-base-200/30 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-base-content/70">
        <span className="text-xl leading-none">{icon}</span>
        {label}
      </p>
      <div className="flex gap-2">
        <Input
          autoFocus
          className="flex-1"
          disabled={loading}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) {
              e.preventDefault();
              onConfirm(url.trim());
            }
            if (e.key === "Escape") {
              onCancel?.();
            }
          }}
          placeholder={placeholder}
          type="url"
          value={url}
        />
        <Button
          disabled={!url.trim() || loading}
          onClick={() => url.trim() && onConfirm(url.trim())}
          onMouseDown={(e) => e.preventDefault()}
          size="sm"
          type="button"
        >
          {loading ? "Loading…" : "Embed ↵"}
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {onCancel && (
        <Button
          className="text-base-content/70"
          onClick={onCancel}
          onMouseDown={(e) => e.preventDefault()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

function BookmarkCard({
  preview,
  onChange,
  onDelete,
}: {
  preview: LinkPreview;
  onChange?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative my-2">
      <a
        className="block"
        href={preview.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Card className="flex-row overflow-hidden p-0 transition-colors hover:border-primary/40">
          <div className="min-w-0 flex-1 space-y-1 p-3.5">
            <p className="truncate text-sm font-semibold text-base-content">
              {preview.title || preview.url}
            </p>
            {preview.description && (
              <p className="line-clamp-2 text-xs text-base-content/70">
                {preview.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 pt-1 text-xs text-base-content/70">
              {preview.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                // biome-ignore lint/performance/noImgElement: src is an arbitrary third-party/user-supplied URL; next/image would need a wildcard remotePatterns entry
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a browser resource-lifecycle event, not a user interaction — it hides the favicon when the remote site has none. The icon is decorative (alt=""), so there is nothing here for a keyboard or screen-reader user to reach.
                <img
                  alt=""
                  className="size-3.5 shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  src={preview.favicon}
                />
              )}
              <span className="truncate">
                {preview.siteName || preview.url}
              </span>
            </div>
          </div>
          {preview.image && (
            // eslint-disable-next-line @next/next/no-img-element
            // biome-ignore lint/performance/noImgElement: src is an arbitrary third-party/user-supplied URL; next/image would need a wildcard remotePatterns entry
            <img
              alt=""
              className="h-full w-32 shrink-0 object-cover"
              src={preview.image}
            />
          )}
        </Card>
      </a>
      {(onChange || onDelete) && (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onDelete && (
            <button
              className="rounded-sm bg-black/70 px-2 py-1 text-xs text-white hover:bg-error/80"
              onMouseDown={(e) => {
                e.preventDefault();
                onDelete();
              }}
              type="button"
            >
              Delete
            </button>
          )}
          {onChange && (
            <button
              className="rounded-sm bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/80"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange();
              }}
              type="button"
            >
              Change
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BookmarkSkeleton() {
  return (
    <Card className="my-2 flex-row items-center gap-3 p-3.5">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-full" />
      </div>
    </Card>
  );
}

async function fetchPreview(url: string): Promise<LinkPreview> {
  const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(
      (json as { error?: string }).error ??
        "Couldn't load a preview for this link"
    );
  }
  return res.json();
}

// ── Bookmark ──────────────────────────────────────────────────────────────────
function BookmarkBlockView({ node, updateAttributes }: NodeViewProps) {
  const url = (node.attrs.url as string) || "";
  const [picking, setPicking] = useState(!url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview: LinkPreview | null = url
    ? {
        url,
        title: (node.attrs.title as string) || null,
        description: (node.attrs.description as string) || null,
        image: (node.attrs.image as string) || null,
        favicon: (node.attrs.favicon as string) || null,
        siteName: (node.attrs.siteName as string) || null,
      }
    : null;

  const confirm = useCallback(
    async (newUrl: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPreview(newUrl);
        updateAttributes({
          url: data.url,
          title: data.title ?? "",
          description: data.description ?? "",
          image: data.image ?? "",
          favicon: data.favicon ?? "",
          siteName: data.siteName ?? "",
        });
        setPicking(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't load a preview for this link"
        );
      } finally {
        setLoading(false);
      }
    },
    [updateAttributes]
  );

  function handleDelete() {
    updateAttributes({
      url: "",
      title: "",
      description: "",
      image: "",
      favicon: "",
      siteName: "",
    });
    setPicking(true);
  }

  if (picking || !preview) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <UrlPicker
          error={error}
          icon="🔖"
          label="Bookmark"
          loading={loading}
          onCancel={url ? () => setPicking(false) : undefined}
          onConfirm={confirm}
          placeholder="Paste a link…"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <BookmarkCard
        onChange={() => setPicking(true)}
        onDelete={handleDelete}
        preview={preview}
      />
    </NodeViewWrapper>
  );
}

export const BookmarkBlock = Node.create({
  name: "bookmarkBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: "" },
      favicon: { default: "" },
      siteName: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='bookmarkBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "bookmarkBlock" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkBlockView);
  },
});

// ── Embed ─────────────────────────────────────────────────────────────────────
// v1: pattern-match known providers into a direct iframe embed URL (no oEmbed
// API round-trip needed for these). Anything unrecognized falls back to the
// same link-preview card Bookmark uses.
function getIframeEmbedUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) {
      return `https://www.youtube.com/embed/${id}`;
    }
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) {
      return `https://www.youtube.com/embed/${id}`;
    }
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id) {
      return `https://player.vimeo.com/video/${id}`;
    }
  }
  if (host === "figma.com" || host === "www.figma.com") {
    return `https://www.figma.com/embed?embed_host=pagevo&url=${encodeURIComponent(rawUrl)}`;
  }
  if (host === "loom.com") {
    const id = u.pathname.split("/").filter(Boolean).pop();
    if (id) {
      return `https://www.loom.com/embed/${id}`;
    }
  }
  if (host === "codepen.io") {
    return rawUrl.replace("/pen/", "/embed/");
  }
  return null;
}

// Same visual convention as MediaActions (media-blocks.tsx) — a hover-only
// absolute toolbar — extended with Comment/Zoom/Download, which MediaActions
// itself doesn't need since only Embed currently supports file uploads.
function EmbedToolbar({
  onComment,
  onZoom,
  download,
  onChangeDirect,
  onDelete,
}: {
  onComment?: () => void;
  onZoom?: () => void;
  download?: { url: string; name: string };
  onChangeDirect: () => void;
  onDelete: () => void;
}) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  return (
    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {onComment && (
        <button
          className="flex size-6 items-center justify-center rounded-sm bg-black/70 text-white hover:bg-black/80"
          onClick={onComment}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={(e) => showTooltip("Comment", e)}
          onMouseLeave={hideTooltip}
          type="button"
        >
          <MessageSquare size={13} />
        </button>
      )}
      {onZoom && (
        <button
          className="flex size-6 items-center justify-center rounded-sm bg-black/70 text-white hover:bg-black/80"
          onClick={onZoom}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={(e) => showTooltip("Expand", e)}
          onMouseLeave={hideTooltip}
          type="button"
        >
          <Maximize2 size={13} />
        </button>
      )}
      {download && (
        <a
          className="flex size-6 items-center justify-center rounded-sm bg-black/70 text-white hover:bg-black/80"
          download={download.name}
          href={download.url}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={(e) => showTooltip("Download", e)}
          onMouseLeave={hideTooltip}
        >
          <DownloadIcon size={13} />
        </a>
      )}
      <button
        className="flex size-6 items-center justify-center rounded-sm bg-black/70 text-white hover:bg-black/80"
        onClick={onChangeDirect}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => showTooltip("Change", e)}
        onMouseLeave={hideTooltip}
        type="button"
      >
        <Pencil size={12} />
      </button>
      <button
        className="flex size-6 items-center justify-center rounded-sm bg-black/70 text-white hover:bg-error/80"
        onClick={onDelete}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => showTooltip("Delete", e)}
        onMouseLeave={hideTooltip}
        type="button"
      >
        <Trash2 size={12} />
      </button>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}

// Renders an iframe or image at larger size on the shared native-<dialog> Dialog; unlike
// comment-card.tsx's hand-rolled ImageLightbox (zoom/pan), this has no interaction beyond backdrop/Escape close.
function EmbedLightbox({
  src,
  isImage,
  title,
  onClose,
}: {
  src: string;
  isImage: boolean;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="h-[90vh] w-[90vw] max-w-none gap-0 border-none bg-transparent p-0 ring-0 backdrop:bg-black/70 sm:max-w-none">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          // biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns
          <img
            alt={title}
            className="mx-auto h-full max-w-full rounded-md object-contain"
            src={src}
          />
        ) : (
          <iframe
            className="size-full rounded-md bg-base-100"
            src={src}
            title={title}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EmbedBlockOptions {
  onComment?: (blockId: string, blockY: number) => void;
  pageId: string;
  workspaceId: string;
}

function EmbedBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  const url = (node.attrs.url as string) || "";
  const fileName = (node.attrs.fileName as string) || "";
  const mimeType = (node.attrs.mimeType as string) || "";
  const blockId = (node.attrs.blockId as string | null) || undefined;
  const { workspaceId, pageId, onComment } =
    extension.options as EmbedBlockOptions;
  const {
    upload,
    uploading,
    error: uploadError,
  } = useUpload({
    kind: "block_media",
    workspaceId,
    pageId,
    blockId,
  });

  const [picking, setPicking] = useState(!url);
  const [expanded, setExpanded] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [zooming, setZooming] = useState(false);
  const changeRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    function handleOutside(e: MouseEvent) {
      if (!popupRef.current?.contains(e.target as globalThis.Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [expanded]);

  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const iframeUrl = url && !mimeType ? getIframeEmbedUrl(url) : null;
  const isUploadedImage = mimeType.startsWith("image/");
  const isUploadedPdf = mimeType === "application/pdf";

  useEffect(() => {
    if (!url || mimeType || iframeUrl) {
      return; // uploaded file or known provider — no fallback fetch needed
    }
    let cancelled = false;
    setPreviewError(false);
    fetchPreview(url)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, mimeType, iframeUrl]);

  function confirm(newUrl: string) {
    updateAttributes({ url: newUrl, fileName: "", mimeType: "" });
    setPreview(null);
    setPicking(false);
    setExpanded(false);
  }

  const uploadFile = useCallback(
    async (file: File) => {
      const result = await upload(file);
      if (!result) {
        return;
      }
      updateAttributes({
        url: result.fileUrl,
        fileName: file.name,
        mimeType: file.type,
      });
      setPreview(null);
      setPicking(false);
      setExpanded(false);
    },
    [upload, updateAttributes]
  );

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    uploadFile(file);
  }

  function handleDelete() {
    updateAttributes({ url: "", fileName: "", mimeType: "" });
    setPreview(null);
    setPicking(true);
    setExpanded(false);
  }

  function handleComment() {
    if (!onComment || !blockId) {
      return;
    }
    const top = wrapperRef.current?.getBoundingClientRect().top ?? 0;
    onComment(blockId, top - 20);
  }

  if (picking || !url) {
    if (!expanded) {
      return (
        <NodeViewWrapper contentEditable={false}>
          <button
            className="my-1 flex w-full items-center gap-2.5 rounded-md border border-base-300 bg-base-200/20 px-3.5 py-2.5 text-sm text-base-content/70 transition-colors hover:border-primary/40 hover:bg-base-200 hover:text-base-content"
            onClick={() => setExpanded(true)}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <span className="text-lg leading-none">🌐</span>
            Embed anything (PDFs, Google Docs, Google Maps, Spotify…)
          </button>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper contentEditable={false}>
        <div
          className="relative my-1 flex flex-col items-center gap-2"
          ref={popupRef}
        >
          <button
            className="flex w-full items-center gap-2.5 rounded-md border border-base-300 bg-base-200/20 px-3.5 py-2.5 text-sm text-base-content/70"
            onClick={() => setExpanded(false)}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <span className="text-lg leading-none">🌐</span>
            Embed anything (PDFs, Google Docs, Google Maps, Spotify…)
          </button>
          <div className="w-full max-w-sm rounded-md border border-base-300 bg-base-100 p-4">
            <Tabs defaultValue="link">
              <TabsList className="w-full" variant="line">
                <TabsTrigger value="link">Link</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>
              <TabsContent className="mt-3 space-y-2" value="link">
                <Input
                  autoFocus
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && linkUrl.trim()) {
                      e.preventDefault();
                      confirm(linkUrl.trim());
                    }
                  }}
                  placeholder="Paste in https://…"
                  type="url"
                  value={linkUrl}
                />
                <Button
                  className="w-full"
                  disabled={!linkUrl.trim()}
                  onClick={() => linkUrl.trim() && confirm(linkUrl.trim())}
                  type="button"
                >
                  Embed link
                </Button>
                <p className="text-center text-xs text-base-content/70">
                  Works with links of PDFs, Google Drive, Google Maps, CodePen…
                </p>
              </TabsContent>
              <TabsContent className="mt-3" value="upload">
                <Button
                  className="w-full"
                  disabled={uploading}
                  onClick={() => changeRef.current?.click()}
                  onMouseDown={(e) => e.preventDefault()}
                  type="button"
                >
                  {uploading ? "Uploading…" : "Choose a file"}
                </Button>
              </TabsContent>
            </Tabs>
            {uploadError && (
              <p className="mt-2 text-xs text-error">{uploadError}</p>
            )}
          </div>
          <input
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  // Uploaded file — rendered directly (PDF/image inline, anything else as a
  // simple file card), not round-tripped through the link-preview scraper
  // (which is for scraping OTHER PEOPLE's webpages, not our own uploads).
  if (mimeType) {
    const downloadInfo = { url, name: fileName || "file" };
    if (isUploadedPdf || isUploadedImage) {
      return (
        <NodeViewWrapper contentEditable={false}>
          <div
            className="group relative my-2 overflow-hidden rounded-md border border-base-300 bg-base-200/20"
            ref={wrapperRef}
          >
            {isUploadedImage ? (
              <button
                aria-label={`Zoom ${fileName || "image"}`}
                className="block w-full cursor-zoom-in"
                onClick={() => setZooming(true)}
                type="button"
              >
                {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
                <img
                  alt={fileName}
                  className="block max-h-120 w-full object-contain"
                  src={url}
                />
              </button>
            ) : (
              <iframe
                className="block w-full"
                src={url}
                style={{ height: 480 }}
                title={fileName || "Embedded PDF"}
              />
            )}
            <EmbedToolbar
              download={downloadInfo}
              onChangeDirect={() => changeRef.current?.click()}
              onComment={onComment && blockId ? handleComment : undefined}
              onDelete={handleDelete}
              onZoom={() => setZooming(true)}
            />
            <input
              className="hidden"
              onChange={onChangeFile}
              ref={changeRef}
              type="file"
            />
          </div>
          {zooming && (
            <EmbedLightbox
              isImage={isUploadedImage}
              onClose={() => setZooming(false)}
              src={url}
              title={fileName}
            />
          )}
        </NodeViewWrapper>
      );
    }
    // Generic uploaded file (not a PDF or image) — no inline preview to
    // render, just a compact card with a name and a way to get the file.
    return (
      <NodeViewWrapper contentEditable={false}>
        <div
          className="group relative my-2 flex items-center gap-2.5 rounded-md border border-base-300 bg-base-200/20 px-3.5 py-2.5"
          ref={wrapperRef}
        >
          <FileIcon className="shrink-0 text-base-content/70" size={18} />
          <span className="min-w-0 flex-1 truncate text-sm text-base-content">
            {fileName || url}
          </span>
          <EmbedToolbar
            download={downloadInfo}
            onChangeDirect={() => changeRef.current?.click()}
            onComment={onComment && blockId ? handleComment : undefined}
            onDelete={handleDelete}
          />
          <input
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  if (iframeUrl) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <div
          className="group relative my-2 overflow-hidden rounded-md border border-base-300 bg-black"
          ref={wrapperRef}
        >
          <iframe
            allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture"
            className="block w-full"
            src={iframeUrl}
            style={{ height: 400 }}
            title="Embedded content"
          />
          <EmbedToolbar
            onChangeDirect={() => setPicking(true)}
            onComment={onComment && blockId ? handleComment : undefined}
            onDelete={handleDelete}
            onZoom={() => setZooming(true)}
          />
        </div>
        {zooming && (
          <EmbedLightbox
            isImage={false}
            onClose={() => setZooming(false)}
            src={iframeUrl}
            title="Embedded content"
          />
        )}
      </NodeViewWrapper>
    );
  }

  // Fallback: unrecognized provider — render the same link-preview card Bookmark uses.
  return (
    <NodeViewWrapper contentEditable={false}>
      {previewError ? (
        <div className="my-2 rounded-md border border-base-300 bg-base-200/20 p-3 text-xs text-base-content/70">
          Couldn&rsquo;t embed this link.{" "}
          <a
            className="text-primary hover:underline"
            href={url}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open it directly ↗
          </a>
        </div>
      ) : preview ? (
        <BookmarkCard
          onChange={() => setPicking(true)}
          onDelete={handleDelete}
          preview={preview}
        />
      ) : (
        <BookmarkSkeleton />
      )}
    </NodeViewWrapper>
  );
}

export const EmbedBlock = Node.create({
  name: "embedBlock",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      workspaceId: "",
      pageId: "",
      onComment: undefined,
    } as EmbedBlockOptions;
  },

  addAttributes() {
    return {
      blockId: { default: null },
      url: { default: "" },
      fileName: { default: "" },
      mimeType: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='embedBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "embedBlock" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedBlockView);
  },
});
