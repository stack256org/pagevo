import path from "path";
import { getStorage } from "@/lib/storage";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

// GET /api/uploads/files/[...path] — the only place any uploaded file is
// served from, regardless of driver. Proxies bytes through the app rather
// than handing out a direct bucket/CDN URL, so local disk and S3/R2 behave
// identically and the storage backend never needs to be reachable by the
// browser for reads (only presigned PUT uploads bypass the app, for s3/r2).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Reject traversal/empty segments before they ever reach a driver.
  if (segments.some((s) => !s || s === "." || s === "..")) {
    return new Response("Forbidden", { status: 403 });
  }
  const objectKey = segments.join("/");

  try {
    const storage = await getStorage();
    const buffer = await storage.download(objectKey);
    const ext = path.extname(objectKey).slice(1).toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
