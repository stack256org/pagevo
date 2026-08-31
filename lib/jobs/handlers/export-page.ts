import { eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { blocks, pages } from "@/lib/db/schema";
import type { PageExportPayload } from "@/lib/jobs/job-names";

// Handles page export jobs. Markdown and HTML are rendered here by the
// worker. Uploading the result to S3 and delivering a download link is still
// TODO Phase 7 (file storage) — for now this only logs.
export async function handleExportPage(jobs: Job<PageExportPayload>[]) {
  const job = jobs[0];
  if (!job) {
    return;
  }
  const { pageId, userId, format } = job.data;

  const [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  if (!page) {
    console.warn(`[export-page] Page ${pageId} not found — skipping.`);
    return;
  }

  const allBlocks = await db
    .select()
    .from(blocks)
    .where(eq(blocks.pageId, pageId))
    .orderBy(blocks.orderIndex);

  // Cast content from unknown to a safe type for rendering
  type BlockRow = {
    type: string;
    content: Record<string, unknown>;
    orderIndex: number;
  };
  const rows: BlockRow[] = allBlocks.map((b) => ({
    type: b.type,
    content: (b.content ?? {}) as Record<string, unknown>,
    orderIndex: b.orderIndex,
  }));

  if (format === "markdown") {
    const md = renderMarkdown(page.title, rows);
    // TODO Phase 7: upload to S3 and deliver download link to user
    console.log(
      `[export-page] Markdown export for page ${pageId} (${md.length} chars) — user ${userId}`
    );
    return;
  }

  if (format === "html") {
    const html = renderHtml(page.title, rows);
    console.log(
      `[export-page] HTML export for page ${pageId} (${html.length} chars) — user ${userId}`
    );
  }
}

export type BlockRow = {
  type: string;
  content: Record<string, unknown>;
  orderIndex: number;
};

export function renderMarkdown(title: string, blockRows: BlockRow[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const block of blockRows) {
    const c = block.content;
    switch (block.type) {
      case "paragraph":
        lines.push(inlineText(c.text as unknown[]));
        break;
      case "h1":
        lines.push(`# ${inlineText(c.text as unknown[])}`);
        break;
      case "h2":
        lines.push(`## ${inlineText(c.text as unknown[])}`);
        break;
      case "h3":
        lines.push(`### ${inlineText(c.text as unknown[])}`);
        break;
      case "bullet":
        lines.push(`- ${inlineText(c.text as unknown[])}`);
        break;
      case "numbered":
        lines.push(`1. ${inlineText(c.text as unknown[])}`);
        break;
      case "quote":
        lines.push(`> ${inlineText(c.text as unknown[])}`);
        break;
      case "todo":
        lines.push(
          `- [${c.checked ? "x" : " "}] ${inlineText(c.text as unknown[])}`
        );
        break;
      case "divider":
        lines.push("---");
        break;
      case "code":
        lines.push(`\`\`\`${c.language ?? ""}\n${c.code ?? ""}\n\`\`\``);
        break;
      case "image":
        lines.push(`![${c.caption ?? ""}](${c.url ?? ""})`);
        break;
      default:
        break;
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderHtml(title: string, blockRows: BlockRow[]): string {
  const body = blockRows
    .map((block) => {
      const c = block.content;
      switch (block.type) {
        case "paragraph":
          return `<p>${inlineText(c.text as unknown[])}</p>`;
        case "h1":
          return `<h1>${inlineText(c.text as unknown[])}</h1>`;
        case "h2":
          return `<h2>${inlineText(c.text as unknown[])}</h2>`;
        case "h3":
          return `<h3>${inlineText(c.text as unknown[])}</h3>`;
        case "divider":
          return "<hr />";
        case "code":
          return `<pre><code class="language-${c.language ?? ""}">${c.code ?? ""}</code></pre>`;
        case "image":
          return `<figure><img src="${c.url ?? ""}" alt="${c.caption ?? ""}" /></figure>`;
        default:
          return "";
      }
    })
    .join("\n");
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
}

function inlineText(nodes: unknown[]): string {
  if (!Array.isArray(nodes)) {
    return "";
  }
  return nodes
    .map((n) =>
      typeof n === "object" && n !== null && "text" in n
        ? ((n as { text: string }).text ?? "")
        : ""
    )
    .join("");
}
