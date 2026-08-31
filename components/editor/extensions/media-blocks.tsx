"use client";

import type { NodeViewProps } from "@tiptap/react";
import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageLightbox } from "@/components/editor/comment-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpload } from "@/lib/storage/use-upload";

// ── Shared URL / file picker ──────────────────────────────────────────────────
function MediaPicker({
  icon,
  label,
  accept,
  placeholder,
  onConfirm,
  onCancel,
}: {
  icon: string;
  label: string;
  accept: string;
  placeholder: string;
  onConfirm: (src: string) => void;
  onCancel?: () => void;
}) {
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    onConfirm(URL.createObjectURL(file));
  };

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
          disabled={!url.trim()}
          onClick={() => url.trim() && onConfirm(url.trim())}
          onMouseDown={(e) => e.preventDefault()}
          type="button"
        >
          Embed ↵
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-base-300" />
        <span className="text-xs text-base-content/70">or</span>
        <div className="h-px flex-1 bg-base-300" />
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 border-dashed"
          onClick={() => fileRef.current?.click()}
          onMouseDown={(e) => e.preventDefault()}
          type="button"
          variant="outline"
        >
          Choose file from device
        </Button>
        {onCancel && (
          <Button
            onClick={onCancel}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        )}
      </div>

      <input
        accept={accept}
        className="hidden"
        onChange={handleFile}
        ref={fileRef}
        type="file"
      />
    </div>
  );
}

// ── Shared hover action bar ───────────────────────────────────────────────────
function MediaActions({
  onChangeDirect,
  onDelete,
  onAddCaption,
}: {
  onChangeDirect: () => void;
  onDelete: () => void;
  /** Omit once a caption is already showing — there's nothing left to reveal. */
  onAddCaption?: () => void;
}) {
  return (
    <div className="absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
      {onAddCaption && (
        <button
          className="rounded-sm bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/80"
          onClick={onAddCaption}
          onMouseDown={(e) => e.preventDefault()}
          type="button"
        >
          Caption
        </button>
      )}
      <button
        className="rounded-sm bg-black/70 px-2 py-1 text-xs text-white hover:bg-error/80"
        onClick={onDelete}
        onMouseDown={(e) => e.preventDefault()}
        type="button"
      >
        Delete
      </button>
      <button
        className="rounded-sm bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/80"
        onClick={onChangeDirect}
        onMouseDown={(e) => e.preventDefault()}
        type="button"
      >
        Change
      </button>
    </div>
  );
}

// ── Image ─────────────────────────────────────────────────────────────────────
function ImageBlockView({ node, updateAttributes }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const caption = (node.attrs.caption as string) || "";
  const [picking, setPicking] = useState(!src);
  const [captionDraft, setCaptionDraft] = useState(caption);
  // Notion doesn't show a caption field under an image until you ask for one —
  // only pre-show it here if a caption was already saved.
  const [showCaption, setShowCaption] = useState(!!caption);
  const [previewOpen, setPreviewOpen] = useState(false);
  const changeRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (newSrc: string) => {
      updateAttributes({ src: newSrc });
      setPicking(false);
    },
    [updateAttributes]
  );

  // Change — directly open file picker, no panel
  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    confirm(URL.createObjectURL(file));
  }

  // Delete — clear image and show picker panel so user can choose a new one
  function handleDelete() {
    updateAttributes({ src: "" });
    setPicking(true);
  }

  function addCaption() {
    setShowCaption(true);
    requestAnimationFrame(() => captionRef.current?.focus());
  }

  if (picking) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <MediaPicker
          accept="image/*"
          icon="🖼"
          label="Image"
          onCancel={src ? () => setPicking(false) : undefined}
          onConfirm={confirm}
          placeholder="Paste image URL…"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <figure className="group my-3">
        <div className="relative overflow-hidden rounded-md border border-base-300 bg-base-200/20">
          <button
            className="block w-full"
            onClick={() => setPreviewOpen(true)}
            type="button"
          >
            {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a browser resource-lifecycle event, not a user interaction — it falls back to the URL picker when the image cannot load. The click affordance lives on the wrapping button, which is keyboard-operable. */}
            <img
              alt={captionDraft || "Image"}
              className="block w-full cursor-zoom-in"
              onError={() => setPicking(true)}
              src={src}
              style={{ maxHeight: 520, objectFit: "contain" }}
            />
          </button>
          <MediaActions
            onAddCaption={showCaption ? undefined : addCaption}
            onChangeDirect={() => changeRef.current?.click()}
            onDelete={handleDelete}
          />
          <input
            accept="image/*"
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
          {previewOpen && (
            <ImageLightbox
              alt={captionDraft || "Image"}
              onClose={() => setPreviewOpen(false)}
              src={src}
            />
          )}
        </div>
        {showCaption && (
          <input
            className="mt-1.5 w-full bg-transparent text-center text-xs text-base-content/70 outline-none placeholder:text-base-content/50"
            onChange={(e) => {
              setCaptionDraft(e.target.value);
              updateAttributes({ caption: e.target.value });
            }}
            placeholder="Add a caption…"
            ref={captionRef}
            type="text"
            value={captionDraft}
          />
        )}
      </figure>
    </NodeViewWrapper>
  );
}

// ── Video ─────────────────────────────────────────────────────────────────────
function VideoBlockView({ node, updateAttributes }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const caption = (node.attrs.caption as string) || "";
  const [picking, setPicking] = useState(!src);
  const [captionDraft, setCaptionDraft] = useState(caption);
  const [showCaption, setShowCaption] = useState(!!caption);
  const changeRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (newSrc: string) => {
      updateAttributes({ src: newSrc });
      setPicking(false);
    },
    [updateAttributes]
  );

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    confirm(URL.createObjectURL(file));
  }

  function handleDelete() {
    updateAttributes({ src: "" });
    setPicking(true);
  }

  function addCaption() {
    setShowCaption(true);
    requestAnimationFrame(() => captionRef.current?.focus());
  }

  if (picking) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <MediaPicker
          accept="video/*"
          icon="🎬"
          label="Video"
          onCancel={src ? () => setPicking(false) : undefined}
          onConfirm={confirm}
          placeholder="Paste video URL…"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <figure className="group my-3">
        <div className="relative overflow-hidden rounded-md border border-base-300 bg-black">
          {/* biome-ignore lint/a11y/useMediaCaption: caption is below */}
          <video
            className="block w-full"
            controls
            onError={() => setPicking(true)}
            src={src}
            style={{ maxHeight: 480 }}
          />
          <MediaActions
            onAddCaption={showCaption ? undefined : addCaption}
            onChangeDirect={() => changeRef.current?.click()}
            onDelete={handleDelete}
          />
          <input
            accept="video/*"
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
        {showCaption && (
          <input
            className="mt-1.5 w-full bg-transparent text-center text-xs text-base-content/70 outline-none placeholder:text-base-content/50"
            onChange={(e) => {
              setCaptionDraft(e.target.value);
              updateAttributes({ caption: e.target.value });
            }}
            placeholder="Add a caption…"
            ref={captionRef}
            type="text"
            value={captionDraft}
          />
        )}
      </figure>
    </NodeViewWrapper>
  );
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function AudioBlockView({ node, updateAttributes }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const caption = (node.attrs.caption as string) || "";
  const [picking, setPicking] = useState(!src);
  const [captionDraft, setCaptionDraft] = useState(caption);
  const [showCaption, setShowCaption] = useState(!!caption);
  const changeRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (newSrc: string) => {
      updateAttributes({ src: newSrc });
      setPicking(false);
    },
    [updateAttributes]
  );

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    confirm(URL.createObjectURL(file));
  }

  function handleDelete() {
    updateAttributes({ src: "" });
    setPicking(true);
  }

  function addCaption() {
    setShowCaption(true);
    requestAnimationFrame(() => captionRef.current?.focus());
  }

  if (picking) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <MediaPicker
          accept="audio/*"
          icon="🎵"
          label="Audio"
          onCancel={src ? () => setPicking(false) : undefined}
          onConfirm={confirm}
          placeholder="Paste audio URL…"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <figure className="group my-2">
        <div className="relative flex items-center gap-3 rounded-sm border border-base-300 bg-base-200/30 px-4 py-3">
          <span className="text-2xl">🎵</span>
          {/* biome-ignore lint/a11y/useMediaCaption: caption is below */}
          <audio
            className="h-9 flex-1"
            controls
            src={src}
            style={{ minWidth: 0 }}
          />
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!showCaption && (
              <button
                className="rounded px-2 py-1 text-xs text-base-content/70 hover:bg-base-200"
                onClick={addCaption}
                onMouseDown={(e) => e.preventDefault()}
                type="button"
              >
                Caption
              </button>
            )}
            <button
              className="rounded px-2 py-1 text-xs text-error hover:bg-error/5"
              onClick={handleDelete}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              Delete
            </button>
            <button
              className="rounded px-2 py-1 text-xs text-base-content/70 hover:bg-base-200"
              onClick={() => changeRef.current?.click()}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              Change
            </button>
          </div>
          <input
            accept="audio/*"
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
        {showCaption && (
          <input
            className="mt-1.5 w-full bg-transparent text-center text-sm text-base-content/70 outline-none placeholder:text-base-content/50"
            onChange={(e) => {
              setCaptionDraft(e.target.value);
              updateAttributes({ caption: e.target.value });
            }}
            placeholder="Add a caption…"
            ref={captionRef}
            type="text"
            value={captionDraft}
          />
        )}
      </figure>
    </NodeViewWrapper>
  );
}

// ── File ──────────────────────────────────────────────────────────────────────
function FileBlockView({ node, updateAttributes }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const caption = (node.attrs.caption as string) || "";
  const [picking, setPicking] = useState(!src);
  const defaultName = src.split("/").pop() || "File";
  const [captionDraft, setCaptionDraft] = useState(caption || defaultName);
  const changeRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (newSrc: string) => {
      const name = newSrc.split("/").pop() || "File";
      const newCaption = caption || name;
      updateAttributes({ src: newSrc, caption: newCaption });
      setCaptionDraft(newCaption);
      setPicking(false);
    },
    [updateAttributes, caption]
  );

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    confirm(URL.createObjectURL(file));
  }

  function handleDelete() {
    updateAttributes({ src: "", caption: "" });
    setPicking(true);
  }

  if (picking) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <MediaPicker
          accept="*"
          icon="📎"
          label="File"
          onCancel={src ? () => setPicking(false) : undefined}
          onConfirm={confirm}
          placeholder="Paste file URL…"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="group my-2 flex items-center justify-between rounded-sm border border-base-300 bg-base-200/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-2xl">📎</span>
          <div className="min-w-0">
            <a
              className="block truncate text-sm font-medium text-base-content underline underline-offset-2 hover:text-primary"
              download
              href={src}
              onClick={(e) => e.stopPropagation()}
            >
              {captionDraft}
            </a>
            <p className="max-w-xs truncate text-xs text-base-content/70">
              {src}
            </p>
          </div>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="rounded px-2 py-1 text-xs text-error hover:bg-error/5"
            onClick={handleDelete}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            Delete
          </button>
          <button
            className="rounded px-2 py-1 text-xs text-base-content/70 hover:bg-base-200"
            onClick={() => changeRef.current?.click()}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            Change
          </button>
          <input
            accept="*"
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
      </div>
      <input
        className="mt-1 w-full bg-transparent text-center text-sm text-base-content/70 outline-none placeholder:text-base-content/50"
        onChange={(e) => {
          setCaptionDraft(e.target.value);
          updateAttributes({ caption: e.target.value });
        }}
        placeholder="File name…"
        type="text"
        value={captionDraft}
      />
    </NodeViewWrapper>
  );
}

// ── PDF ───────────────────────────────────────────────────────────────────────
// Unlike Image/Video/Audio/File above (session-local blob URLs), this wires the real
// sign → PUT/POST → confirm upload flow so a picked PDF survives reload and is visible to other users.
interface PdfBlockOptions {
  pageId: string;
  workspaceId: string;
}

function PdfBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const caption = (node.attrs.caption as string) || "";
  const blockId = (node.attrs.blockId as string | null) || undefined;
  const { workspaceId, pageId } = extension.options as PdfBlockOptions;
  const { upload, uploading, error } = useUpload({
    kind: "block_media",
    workspaceId,
    pageId,
    blockId,
  });

  const [picking, setPicking] = useState(!src);
  const [expanded, setExpanded] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const defaultName = src.split("/").pop() || "PDF";
  const [captionDraft, setCaptionDraft] = useState(caption || defaultName);
  const changeRef = useRef<HTMLInputElement>(null);
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

  const uploadFile = useCallback(
    async (file: File) => {
      const result = await upload(file);
      if (!result) {
        return;
      }
      const newCaption = caption || file.name;
      updateAttributes({
        src: result.fileUrl,
        objectKey: result.objectKey,
        caption: newCaption,
      });
      setCaptionDraft(newCaption);
      setPicking(false);
      setExpanded(false);
    },
    [upload, updateAttributes, caption]
  );

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    uploadFile(file);
  }

  function confirmLink() {
    const url = linkUrl.trim();
    if (!url) {
      return;
    }
    const newCaption = caption || url.split("/").pop() || "PDF";
    updateAttributes({ src: url, caption: newCaption });
    setCaptionDraft(newCaption);
    setPicking(false);
    setExpanded(false);
  }

  function handleDelete() {
    updateAttributes({ src: "", caption: "", objectKey: "" });
    setPicking(true);
    setExpanded(false);
  }

  if (picking) {
    if (!expanded) {
      return (
        <NodeViewWrapper contentEditable={false}>
          <button
            className="my-1 flex w-full items-center gap-2.5 rounded-md border border-base-300 bg-base-200/20 px-3.5 py-2.5 text-sm text-base-content/70 transition-colors hover:border-primary/40 hover:bg-base-200 hover:text-base-content"
            onClick={() => setExpanded(true)}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <span className="text-lg leading-none">📕</span>
            Embed a PDF
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
            <span className="text-lg leading-none">📕</span>
            Embed a PDF
          </button>
          <div className="w-full max-w-sm rounded-md border border-base-300 bg-base-100 p-4">
            <Tabs defaultValue="upload">
              <TabsList className="w-full" variant="line">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="link">Link</TabsTrigger>
              </TabsList>
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
              <TabsContent className="mt-3 space-y-2" value="link">
                <Input
                  autoFocus
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmLink();
                    }
                  }}
                  placeholder="https://…"
                  type="url"
                  value={linkUrl}
                />
                <Button
                  className="w-full"
                  disabled={!linkUrl.trim()}
                  onClick={confirmLink}
                  type="button"
                >
                  Embed PDF
                </Button>
                <p className="text-center text-xs text-base-content/70">
                  Embed a PDF file
                </p>
              </TabsContent>
            </Tabs>
            {error && <p className="mt-2 text-xs text-error">{error}</p>}
          </div>
          <input
            accept="application/pdf"
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <figure className="group my-3">
        <div className="relative overflow-hidden rounded-md border border-base-300 bg-base-200/20">
          <iframe
            className="block w-full"
            src={src}
            style={{ height: 480 }}
            title={captionDraft}
          />
          <MediaActions
            onChangeDirect={() => changeRef.current?.click()}
            onDelete={handleDelete}
          />
          <input
            accept="application/pdf"
            className="hidden"
            onChange={onChangeFile}
            ref={changeRef}
            type="file"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <input
            className="max-w-xs bg-transparent text-center text-xs text-base-content/70 outline-none placeholder:text-base-content/50"
            onChange={(e) => {
              setCaptionDraft(e.target.value);
              updateAttributes({ caption: e.target.value });
            }}
            placeholder="PDF name…"
            type="text"
            value={captionDraft}
          />
          <a
            className="shrink-0 text-xs text-primary hover:underline"
            href={src}
            onClick={(e) => e.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open in new tab
          </a>
        </div>
      </figure>
    </NodeViewWrapper>
  );
}

export const PdfBlock = Node.create<PdfBlockOptions>({
  name: "pdfBlock",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return { workspaceId: "", pageId: "" };
  },

  addAttributes() {
    return {
      blockId: { default: null },
      src: { default: "" },
      caption: { default: "" },
      objectKey: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='pdfBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "pdfBlock" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfBlockView);
  },
});

// ── Node definitions ───────────────────────────────────────────────────────────
function mediaNode(
  name: string,
  View: Parameters<typeof ReactNodeViewRenderer>[0]
) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        blockId: { default: null },
        src: { default: "" },
        caption: { default: "" },
        objectKey: { default: "" },
        width: { default: 720 },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-type='${name}']` }];
    },

    renderHTML({
      HTMLAttributes,
    }: {
      HTMLAttributes: Record<string, unknown>;
    }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-type": name })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(View);
    },
  });
}

export const ImageBlock = mediaNode("imageBlock", ImageBlockView);
export const VideoBlock = mediaNode("videoBlock", VideoBlockView);
export const AudioBlock = mediaNode("audioBlock", AudioBlockView);
export const FileBlock = mediaNode("fileBlock", FileBlockView);
