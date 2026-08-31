import { env } from "@/lib/env";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

// GET /api/attachments/download?url=&name=
// Proxies the attachment server-side so download/CORS work regardless of the storage host's cross-origin policy.
// Every file URL is same-origin now (served via /api/uploads/files, see
// lib/storage/drivers/*.ts) — this stays as an explicit allowlist rather
// than trusting any `url` query param outright.
function isAllowedHost(url: string): boolean {
  try {
    const target = new URL(url);
    return new URL(env.NEXT_PUBLIC_APP_URL).host === target.host;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    await getSession();

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const name = (searchParams.get("name") ?? "download").replace(
      /["\r\n]/g,
      ""
    );
    if (!url || !isAllowedHost(url)) {
      return apiError(400, "Invalid attachment url");
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return apiError(502, "Failed to fetch attachment");
    }

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[attachments/download]", err);
    return apiError(500, "Internal server error");
  }
}
