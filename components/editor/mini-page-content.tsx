import { Check, ChevronRight } from "lucide-react";

// Small, read-only miniature rendering of a page's first few blocks — used
// wherever a page needs a content preview without mounting a real Tiptap
// editor (template gallery cards, page-reference hover cards, etc.).

export const MINI_WIDTHS = [
  "w-4/5",
  "w-3/5",
  "w-3/4",
  "w-1/2",
  "w-11/12",
  "w-2/3",
  "w-5/6",
] as const;

// Extracts plain, joined text from a block's rich-text content shape
// ({ text: [{ text, marks }] }) — falls back to "" for shapes with no text.
export function blockText(content: unknown): string {
  if (content && typeof content === "object" && "text" in content) {
    const arr = (content as { text?: { text: string }[] }).text;
    if (Array.isArray(arr)) {
      return arr.map((t) => t.text).join("");
    }
  }
  return "";
}

export function MiniPageContent({
  blocks,
}: {
  blocks: { type: string; content?: unknown }[];
}) {
  const items = blocks.length > 0 ? blocks.slice(0, 8) : [];
  if (items.length === 0) {
    return (
      <div className="space-y-1.5">
        <div className="h-1.5 w-2/3 rounded-xs bg-base-content/18" />
        <div className="h-1 w-4/5 rounded-xs bg-base-content/14" />
        <div className="h-1 w-full rounded-xs bg-base-content/12" />
        <div className="h-px bg-base-300 my-1" />
        <div className="flex items-center gap-1.5 pl-1">
          <div className="size-1 shrink-0 rounded-full bg-base-content/30" />
          <div className="h-1 w-3/5 rounded-xs bg-base-content/14" />
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <div className="size-1 shrink-0 rounded-full bg-base-content/30" />
          <div className="h-1 w-4/5 rounded-xs bg-base-content/12" />
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <div className="size-1 shrink-0 rounded-full bg-base-content/30" />
          <div className="h-1 w-1/2 rounded-xs bg-base-content/10" />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {items.map((b, i) => (
        <MiniBlock
          checked={(b.content as { checked?: boolean } | undefined)?.checked}
          // biome-ignore lint/suspicious/noArrayIndexKey: read-only miniature of a page's first 8 blocks; the `blocks` prop shape carries no id, and `wCls` below is derived from the same index, so position is the identity by construction.
          key={i}
          text={blockText(b.content)}
          type={b.type}
          wCls={MINI_WIDTHS[i % MINI_WIDTHS.length]!}
        />
      ))}
    </div>
  );
}

export function MiniBlock({
  type,
  text,
  checked,
  wCls,
}: {
  type: string;
  text: string;
  checked?: boolean;
  wCls: string;
}) {
  // A block with no extractable text (e.g. an empty paragraph) falls back
  // to a plain placeholder bar rather than rendering nothing.
  if (!text && type !== "divider") {
    return <div className={`${wCls} h-1 rounded-xs bg-base-content/12`} />;
  }

  if (type === "divider") {
    return <div className="h-px bg-base-300" />;
  }

  if (type === "h1") {
    return (
      <div className="truncate text-[8px] font-bold leading-tight text-base-content/70">
        {text}
      </div>
    );
  }
  if (type === "h2") {
    return (
      <div className="truncate text-[7.5px] font-semibold leading-tight text-base-content/65">
        {text}
      </div>
    );
  }
  if (type === "h3") {
    return (
      <div className="truncate text-[7px] font-semibold leading-tight text-base-content/60">
        {text}
      </div>
    );
  }

  if (type === "bullet") {
    return (
      <div className="flex items-center gap-1.5 pl-2">
        <div className="size-1 shrink-0 rounded-full bg-primary/45" />
        <div className="truncate text-[7px] leading-tight text-base-content/70">
          {text}
        </div>
      </div>
    );
  }
  if (type === "numbered") {
    return (
      <div className="flex items-center gap-1.5 pl-2">
        <div className="size-1 shrink-0 rounded-xs bg-primary/40" />
        <div className="truncate text-[7px] leading-tight text-base-content/70">
          {text}
        </div>
      </div>
    );
  }

  if (type === "todo") {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className={`flex size-2 shrink-0 items-center justify-center rounded-full border ${checked ? "border-primary bg-primary" : "border-base-300 bg-base-200"}`}
        >
          {checked && (
            <Check
              className="text-primary-content"
              size={6}
              strokeWidth={3.5}
            />
          )}
        </div>
        <div
          className={`truncate text-[7px] leading-tight ${checked ? "text-base-content/50 line-through" : "text-base-content/70"}`}
        >
          {text}
        </div>
      </div>
    );
  }

  if (type === "toggle") {
    return (
      <div className="flex items-center gap-1.5">
        <ChevronRight className="shrink-0 text-primary/50" size={7} />
        <div className="truncate text-[7px] font-medium leading-tight text-base-content/70">
          {text}
        </div>
      </div>
    );
  }

  if (type === "callout") {
    return (
      <div className="flex items-center gap-1.5 rounded-xs bg-warning/10 px-2 py-1">
        <div className="size-1.5 shrink-0 rounded-full bg-warning/60" />
        <div className="truncate text-[7px] leading-tight text-base-content/70">
          {text}
        </div>
      </div>
    );
  }

  if (type === "quote") {
    return (
      <div className="flex gap-1.5 pl-0.5">
        <div className="w-0.5 shrink-0 self-stretch rounded-full bg-base-300" />
        <div className="truncate text-[7px] italic leading-tight text-base-content/70">
          {text}
        </div>
      </div>
    );
  }

  if (type === "code") {
    return (
      <div className="truncate rounded-xs bg-base-200 px-2 py-1 font-mono text-[7px] leading-tight text-base-content/70">
        {text}
      </div>
    );
  }

  return (
    <div className="truncate text-[7px] leading-tight text-base-content/70">
      {text}
    </div>
  );
}
