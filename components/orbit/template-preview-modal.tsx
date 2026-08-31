"use client";

import { AlertCircle, Database, Eye, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { PageIcon } from "@/components/pages/page-icon";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";

interface SchemaProp {
  name: string;
  options?: { name: string; color: string }[];
  type: string;
}
interface SchemaView {
  groupBy?: string;
  isDefault?: boolean;
  name: string;
  type: string;
}
interface DatabaseSchema {
  properties: SchemaProp[];
  sample_rows?: Record<string, string | number>[];
  views: SchemaView[];
}
interface SnapshotBlock {
  children?: SnapshotBlock[];
  content: unknown;
  id: string;
  type: string;
}
interface TemplateDetail {
  category: string;
  description: string | null;
  id: string;
  name: string;
  pageSnapshot: {
    title: string;
    icon: string | null;
    blocks: SnapshotBlock[];
    database_schema?: DatabaseSchema | null;
  };
  status: string;
}

function blockText(content: unknown): string {
  const c = content as { text?: { text?: string }[] } | undefined;
  return (c?.text ?? []).map((t) => t.text ?? "").join("");
}

const BLOCK_LABELS: Record<string, string> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  todo: "To-do",
  bulleted: "Bullet",
  numbered: "Numbered",
  toggle: "Toggle",
  quote: "Quote",
  callout: "Callout",
  divider: "Divider",
  code: "Code",
};

function BlockRow({
  block,
  depth = 0,
}: {
  block: SnapshotBlock;
  depth?: number;
}) {
  const text = blockText(block.content);
  const checked = (block.content as { checked?: boolean } | undefined)?.checked;
  return (
    <>
      <div
        className="flex items-start gap-2 py-1"
        style={{ paddingLeft: depth * 16 }}
      >
        <span className="mt-0.5 shrink-0 rounded-xs bg-base-200 px-1.5 py-0.5 text-2xs font-medium text-base-content/70">
          {block.type === "todo" && checked
            ? "✓ To-do"
            : (BLOCK_LABELS[block.type] ?? block.type)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-base-content/80">
          {text || <span className="italic text-base-content/50">(empty)</span>}
        </span>
      </div>
      {block.children?.map((c) => (
        <BlockRow block={c} depth={depth + 1} key={c.id} />
      ))}
    </>
  );
}

function SchemaPreview({ schema }: { schema: DatabaseSchema }) {
  const propNames = schema.properties.map((p) => p.name);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
          Properties ({schema.properties.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {schema.properties.map((p) => (
            <span
              className="inline-flex items-center gap-1 rounded-sm border border-base-300 bg-base-200/40 px-2 py-1 text-xs text-base-content/80"
              key={p.name}
            >
              {p.name} <span className="text-base-content/50">· {p.type}</span>
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
          Views ({schema.views.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {schema.views.map((v) => (
            <span
              className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
              key={v.name}
            >
              {v.name} <span className="text-primary/60">· {v.type}</span>
              {v.isDefault && (
                <span className="text-primary/60">(default)</span>
              )}
            </span>
          ))}
        </div>
      </div>
      {schema.sample_rows && schema.sample_rows.length > 0 && (
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
            Sample rows ({schema.sample_rows.length})
          </p>
          <div className="overflow-x-auto rounded-md border border-base-300">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-base-200/40">
                  {propNames.map((name) => (
                    <th
                      className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold text-base-content/70"
                      key={name}
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {schema.sample_rows.slice(0, 5).map((row, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored sample_rows — the array is never reordered or spliced here and the rows carry no id, so row order is their only identity.
                  <tr key={i}>
                    {propNames.map((name) => (
                      <td
                        className="whitespace-nowrap px-2.5 py-1.5 text-base-content/80"
                        key={name}
                      >
                        {row[name] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function TemplatePreviewButton({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TemplateDetail | null>(null);

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orbit/templates/${templateId}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load template");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <IconTooltipButton
        icon={<Eye size={14} />}
        label="Preview"
        onClick={openPreview}
      />

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="flex h-[min(600px,88vh)] w-[min(680px,92vw)] max-w-[min(680px,92vw)] sm:max-w-[min(680px,92vw)] flex-col gap-0 overflow-hidden rounded-xl bg-base-200 p-0 ring-0">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2
                className="animate-spin text-base-content/70"
                size={20}
              />
            </div>
          ) : error || !data ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="text-error" size={20} />
              <p className="text-sm text-base-content/70">
                {error || "Template not found"}
              </p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-base-300 bg-base-200/20 px-6 py-5 pr-14">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-base-300 bg-base-100">
                    {data.pageSnapshot.icon ? (
                      <PageIcon icon={data.pageSnapshot.icon} size={24} />
                    ) : (
                      <FileText className="text-base-content/70" size={20} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-base-content">
                      {data.name}
                    </h2>
                    {data.description && (
                      <p className="mt-0.5 text-xs text-base-content/70">
                        {data.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="rounded-xs bg-base-200 px-2 py-0.5 text-2xs font-semibold text-base-content/70">
                        {data.category}
                      </span>
                      <span
                        className={`rounded-xs px-2 py-0.5 text-2xs font-semibold ${data.status === "published" ? "bg-success/10 text-success" : "bg-base-200 text-base-content/70"}`}
                      >
                        {data.status}
                      </span>
                      {data.pageSnapshot.database_schema && (
                        <span className="flex items-center gap-1 rounded-xs bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">
                          <Database size={9} /> Database
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {data.pageSnapshot.database_schema ? (
                  <SchemaPreview schema={data.pageSnapshot.database_schema} />
                ) : data.pageSnapshot.blocks.length === 0 ? (
                  <p className="py-8 text-center text-xs text-base-content/70">
                    This template has no content blocks.
                  </p>
                ) : (
                  <div>
                    <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
                      Content ({data.pageSnapshot.blocks.length} block
                      {data.pageSnapshot.blocks.length === 1 ? "" : "s"})
                    </p>
                    <div className="rounded-md border border-base-300 bg-base-200/20 px-3 py-2">
                      {data.pageSnapshot.blocks.map((b) => (
                        <BlockRow block={b} key={b.id} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
