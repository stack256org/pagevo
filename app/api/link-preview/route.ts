import * as cheerio from "cheerio";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

export interface LinkPreview {
  description: string | null;
  favicon: string | null;
  image: string | null;
  siteName: string | null;
  title: string | null;
  url: string;
}

function toAbsolute(
  base: string,
  maybeRelative: string | undefined
): string | null {
  if (!maybeRelative) {
    return null;
  }
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

// Sites gating content behind client-side JS serve a "please enable JavaScript" shell to our fetch; treat that as no metadata rather than showing it as the title/description.
const JS_REQUIRED_PATTERN =
  /enable javascript|turn on javascript|javascript is (disabled|required|turned off)|javascript.{0,20}(disabled|turned off)/i;

function isJsRequiredNotice(text: string | null | undefined): boolean {
  return !!text && JS_REQUIRED_PATTERN.test(text);
}

// GET /api/link-preview?url=... — fetches a URL's Open Graph metadata
// (title/description/image/favicon), used by the Bookmark block and by
// Embed's fallback for unrecognized providers.
export async function GET(req: Request) {
  try {
    await getSession(); // any authenticated user in the workspace can preview a link

    const { searchParams } = new URL(req.url);
    const target = searchParams.get("url") ?? "";
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return apiError(400, "Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return apiError(400, "Only http(s) URLs are supported");
    }

    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PagevoBot/1.0; +link-preview)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return apiError(422, `Could not fetch URL (${res.status})`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return Response.json({
        url: parsed.toString(),
        title: parsed.hostname,
        description: null,
        image: null,
        favicon: toAbsolute(parsed.toString(), "/favicon.ico"),
        siteName: parsed.hostname,
      } satisfies LinkPreview);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const og = (prop: string) =>
      $(`meta[property="${prop}"]`).attr("content") ??
      $(`meta[name="${prop}"]`).attr("content");
    let title: string | null =
      og("og:title") ?? $("title").first().text() ?? null;
    let description: string | null =
      og("og:description") ??
      $('meta[name="description"]').attr("content") ??
      null;
    if (isJsRequiredNotice(title) || isJsRequiredNotice(description)) {
      title = null;
      description = null;
    }
    const image = toAbsolute(parsed.toString(), og("og:image"));
    const siteName = og("og:site_name") ?? parsed.hostname;
    const iconHref =
      $('link[rel="icon"]').attr("href") ??
      $('link[rel="shortcut icon"]').attr("href") ??
      "/favicon.ico";
    const favicon = toAbsolute(parsed.toString(), iconHref);

    return Response.json({
      url: parsed.toString(),
      title: title?.trim() || parsed.hostname,
      description: description?.trim() || null,
      image,
      favicon,
      siteName: siteName?.trim() || parsed.hostname,
    } satisfies LinkPreview);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Could not load a preview for this link");
  }
}
