import { mergeAttributes, Node } from "@tiptap/react";
import { parseIcon } from "@/components/pages/page-icon";

// renderHTML returns a plain DOM spec, so a Lucide-icon or uploaded-image page
// icon (both stored as JSON) can't be drawn here the way <PageIcon> does it in
// React. Emoji icons pass through; anything else falls back to the default
// glyph — the point is that raw JSON must never reach the document as text.
function mentionIconGlyph(icon: unknown): string {
  const parsed = typeof icon === "string" ? parseIcon(icon) : null;
  return parsed?.kind === "emoji" ? parsed.value : "📄";
}

interface MentionNodeOptions {
  workspaceSlug: string;
}

// Inline atom node that stores @mention data (user / page / date).
// Required so TipTap serializes the node to JSON correctly; without this
// the schema drops unknown nodes silently and notifications never fire.
export const MentionNode = Node.create<MentionNodeOptions>({
  name: "mention",
  group: "inline",
  inline: true,
  selectable: false,
  atom: true,

  addOptions() {
    return { workspaceSlug: "" };
  },

  addAttributes() {
    return {
      mentionType: { default: "user" },
      id: { default: null },
      label: { default: null },
      // Only used by mentionType "page" — the target page's icon + shortId,
      // so an inline page link (via "@" or "[[") previews and navigates the
      // same way as the "Link to page" block card.
      icon: { default: null },
      shortId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "[data-mention-type]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { mentionType, label, icon, shortId } = node.attrs;

    const cls =
      mentionType === "user"
        ? "text-primary font-medium bg-primary/6 rounded px-0.5 not-prose cursor-pointer"
        : mentionType === "page"
          ? "text-base-content underline decoration-dotted not-prose cursor-pointer"
          : "text-primary font-medium bg-primary/6 rounded px-0.5 not-prose cursor-pointer";

    // Only "user" mentions get the "@" prefix — pages show their icon
    // instead, dates read as plain text, matching Notion's conventions.
    const text =
      mentionType === "user"
        ? `@${label ?? ""}`
        : mentionType === "page"
          ? `${mentionIconGlyph(icon)} ${label ?? ""}`
          : `📅 ${label ?? ""}`;

    const attrs = mergeAttributes(
      {
        "data-mention-type": mentionType,
        contenteditable: "false",
        class: cls,
      },
      HTMLAttributes
    );

    // Real <a href> so clicking a page mention navigates like the "Link to
    // page" card — contenteditable="false" already lifts it out of the
    // editable flow, same trick the resolved block-level cards rely on.
    if (mentionType === "page" && shortId && this.options.workspaceSlug) {
      return [
        "a",
        { ...attrs, href: `/app/${this.options.workspaceSlug}/${shortId}` },
        text,
      ];
    }

    return ["span", attrs, text];
  },
});
