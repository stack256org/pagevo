"use client";

import { useCallback, useRef, useState } from "react";

export type UploadKind =
  | "page_cover"
  | "page_icon"
  | "block_media"
  | "user_avatar"
  | "workspace_icon"
  | "database_file"
  | "template_cover";

interface UseUploadOptions {
  blockId?: string;
  kind: UploadKind;
  pageId?: string;
  workspaceId?: string;
}

interface UploadResult {
  fileUploadId: string;
  fileUrl: string;
  objectKey: string;
}

export function useUpload(opts: UseUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // React state updates from inside `upload` aren't visible to a caller that
  // reads `error` right after `await upload(file)` resolves (same tick, no
  // re-render yet) — this ref gives callers a synchronous way to get the
  // message that caused the null return.
  const lastErrorRef = useRef<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      setUploading(true);
      setError(null);
      lastErrorRef.current = null;

      try {
        // 1. Sign — get an upload slot from the server
        const signRes = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: opts.kind,
            mimeType: file.type,
            fileSizeBytes: file.size,
            workspaceId: opts.workspaceId || undefined,
            pageId: opts.pageId || undefined,
            blockId: opts.blockId || undefined,
          }),
        });

        if (!signRes.ok) {
          const json = await signRes.json().catch(() => ({}));
          throw new Error(
            (json as { error?: string }).error ??
              `Sign failed (${signRes.status})`
          );
        }

        const signed = (await signRes.json()) as {
          fileUploadId: string;
          objectKey: string;
          fileUrl: string;
          upload: {
            url: string;
            method: "PUT" | "POST";
            headers: Record<string, string>;
          };
        };

        // 2. Upload — PUT for S3/R2, POST multipart for local driver
        if (signed.upload.method === "PUT") {
          const putRes = await fetch(signed.upload.url, {
            method: "PUT",
            headers: { "Content-Type": file.type, ...signed.upload.headers },
            body: file,
          });
          if (!putRes.ok) {
            throw new Error(`Upload failed (${putRes.status})`);
          }
        } else {
          const form = new FormData();
          form.append("objectKey", signed.objectKey);
          form.append("file", file);
          const postRes = await fetch(signed.upload.url, {
            method: "POST",
            headers: signed.upload.headers,
            body: form,
          });
          if (!postRes.ok) {
            const json = await postRes.json().catch(() => ({}));
            throw new Error(
              (json as { error?: string }).error ??
                `Upload failed (${postRes.status})`
            );
          }
        }

        // 3. Confirm — mark confirmed_at and increment workspace usage
        const confirmRes = await fetch("/api/uploads/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileUploadId: signed.fileUploadId }),
        });

        if (!confirmRes.ok) {
          const json = await confirmRes.json().catch(() => ({}));
          throw new Error(
            (json as { error?: string }).error ??
              `Confirm failed (${confirmRes.status})`
          );
        }

        return {
          fileUploadId: signed.fileUploadId,
          objectKey: signed.objectKey,
          fileUrl: signed.fileUrl,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        lastErrorRef.current = msg;
        setError(msg);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [opts.kind, opts.workspaceId, opts.pageId, opts.blockId]
  );

  const getLastError = useCallback(() => lastErrorRef.current, []);

  return { upload, uploading, error, getLastError };
}
