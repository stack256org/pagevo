import { PluginKey } from "@tiptap/pm/state";
import { Extension } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import Suggestion from "@tiptap/suggestion";
import { resolveDisplayName } from "@/lib/users/display-name";

export type MentionItem =
  | { mentionType: "user"; id: string; label: string; image?: string | null }
  | {
      mentionType: "page";
      id: string;
      label: string;
      icon?: string | null;
      shortId?: string | null;
    }
  | { mentionType: "date"; id: string; label: string }
  // Synthetic row shown by "[[" when no result matches the typed name —
  // selecting it creates a brand-new page (nested under the current one),
  // matching Notion's "[[New page name" → "Create new page" affordance.
  | { mentionType: "create_page"; query: string };

export type MentionSuggestionProps = SuggestionProps<MentionItem>;

// Exported so the editor's autosave can check whether "@" or "[[" is still
// live (mid-query, nothing picked yet) before persisting — same reasoning as
// SLASH_COMMANDS_PLUGIN_KEY in slash-commands.ts.
export const MENTION_PLUGIN_KEY = new PluginKey("mentionCommands");
export const PAGE_LINK_PLUGIN_KEY = new PluginKey("pageLinkCommands");

export interface MentionOptions {
  currentPageId: string;
  onKeyDown: (event: KeyboardEvent) => boolean;
  onUpdate: (props: MentionSuggestionProps | null) => void;
  workspaceId: string;
}

async function fetchMentionItems(
  query: string,
  workspaceId: string
): Promise<MentionItem[]> {
  const q = query.trim().toLowerCase();
  const items: MentionItem[] = [];

  // People — GET /api/workspaces/:id/members doesn't take q/limit params (it
  // always returns the full member list, active + invited), and its rows are
  // shaped { userId, userName, userEmail, userImage, status, ... } rather
  // than { id, name, image } — filtering/limiting here instead.
  try {
    const res = await fetch(`/api/workspaces/${workspaceId}/members`);
    if (res.ok) {
      const data = await res.json();
      const members: Array<{
        userId?: string | null;
        status?: string;
        userName?: string | null;
        userEmail?: string | null;
        userImage?: string | null;
      }> = data.members ?? data ?? [];
      for (const m of members) {
        if (items.length >= 5) {
          break;
        }
        if (m.status !== "active" || !m.userId) {
          continue;
        }
        const label = resolveDisplayName(m.userName, m.userEmail);
        if (!label) {
          continue;
        }
        if (q && !label.toLowerCase().includes(q)) {
          continue;
        }
        items.push({
          mentionType: "user",
          id: m.userId,
          label,
          image: m.userImage,
        });
      }
    }
  } catch {
    /* ignore */
  }

  // Pages
  items.push(...(await fetchPageMentionItems(query, workspaceId)));

  // Dates (always include)
  items.push(...generateDateItems(q).slice(0, 5));

  return items.slice(0, 10);
}

async function fetchPageMentionItems(
  query: string,
  workspaceId: string
): Promise<MentionItem[]> {
  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&workspaceId=${workspaceId}&type=page&limit=5`
    );
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    const results: Array<{
      id?: string;
      pageId?: string;
      title?: string;
      icon?: string | null;
      shortId?: string;
    }> = data.results ?? [];
    const items: MentionItem[] = [];
    for (const r of results.slice(0, 5)) {
      const id = r.pageId ?? r.id;
      const title = r.title;
      if (id && title) {
        items.push({
          mentionType: "page",
          id,
          label: title,
          icon: r.icon,
          shortId: r.shortId,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function generateDateItems(query: string): MentionItem[] {
  const now = new Date();
  const candidates = [
    { label: "Today", date: addDays(now, 0) },
    { label: "Tomorrow", date: addDays(now, 1) },
    { label: "Yesterday", date: addDays(now, -1) },
    { label: "Next Monday", date: nextWeekdayDate(1) },
    { label: "Next Wednesday", date: nextWeekdayDate(3) },
    { label: "Next Friday", date: nextWeekdayDate(5) },
  ];

  const seenDates = new Set<string>();

  return candidates
    .filter(({ label }) => !query || label.toLowerCase().startsWith(query))
    .map(({ label, date }) => ({
      label,
      iso: date.toISOString().split("T")[0],
    }))
    .filter(({ iso }) => {
      // "Next Weekday" can land on the same date as Today/Tomorrow/Yesterday, which would
      // duplicate the `id` (the date string) — drop the later duplicate, earlier label wins.
      if (seenDates.has(iso)) {
        return false;
      }
      seenDates.add(iso);
      return true;
    })
    .map(({ label, iso }) => ({
      mentionType: "date" as const,
      id: iso,
      label,
    }));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nextWeekdayDate(targetDay: number): Date {
  const today = new Date();
  const diff = (targetDay + 7 - today.getDay()) % 7 || 7;
  return addDays(today, diff);
}

/**
 * TipTap extension for @mention — uses the same callback pattern as SlashCommands
 * so the UI renders in the editor's React tree (no tippy.js needed).
 */
export const MentionCommands = Extension.create<MentionOptions>({
  name: "mentionCommands",

  addOptions() {
    return {
      workspaceId: "",
      currentPageId: "",
      onUpdate: () => {},
      onKeyDown: () => false,
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options;

    return [
      Suggestion<MentionItem>({
        pluginKey: MENTION_PLUGIN_KEY,
        editor: this.editor,
        char: "@",
        startOfLine: false,
        allowSpaces: false,

        items: ({ query }) => fetchMentionItems(query, opts.workspaceId),

        command: ({ editor, range, props: item }) => {
          // "@" never fetches a "create_page" row (only "[[" does), but the
          // shared MentionItem union includes it, so narrow it away here too
          // for type safety.
          if (item.mentionType === "create_page") {
            return;
          }
          // Delete the "@query" text and insert a mention node
          // Since we're using a plain Extension (not Node extension),
          // we insert styled text as a workaround until a Node type is registered.
          // Full Node implementation: use @tiptap/extension-mention Node directly.
          editor
            .chain()
            .deleteRange(range)
            .insertContent({
              type: "mention",
              attrs: {
                mentionType: item.mentionType,
                id: item.id,
                label: item.label,
                icon: item.mentionType === "page" ? (item.icon ?? null) : null,
                shortId:
                  item.mentionType === "page" ? (item.shortId ?? null) : null,
              },
            })
            .run();
        },

        render: () => ({
          onStart: (props: MentionSuggestionProps) => opts.onUpdate(props),
          onUpdate: (props: MentionSuggestionProps) => opts.onUpdate(props),
          onKeyDown: (props: SuggestionKeyDownProps) =>
            opts.onKeyDown(props.event),
          onExit: () => opts.onUpdate(null),
        }),
      }),

      // "[[" — Notion's other page-linking shortcut, alongside "/link to page".
      // Inserts the same inline page mention as "@page", just scoped to pages only.
      Suggestion<MentionItem>({
        pluginKey: PAGE_LINK_PLUGIN_KEY,
        editor: this.editor,
        char: "[[",
        startOfLine: false,
        allowSpaces: false,

        items: async ({ query }) => {
          const pages = await fetchPageMentionItems(query, opts.workspaceId);
          const q = query.trim();
          // Notion always offers "Create page" alongside any matches, so you
          // can make a new page even when a similarly-named one exists.
          if (q) {
            pages.push({ mentionType: "create_page", query: q });
          }
          return pages;
        },

        command: ({ editor, range, props: item }) => {
          if (item.mentionType === "create_page") {
            const title = item.query;
            fetch("/api/pages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId: opts.workspaceId,
                parentId: opts.currentPageId || null,
                title,
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then(
                (
                  page: {
                    id: string;
                    shortId: string;
                    icon: string | null;
                    title: string | null;
                  } | null
                ) => {
                  if (!page) {
                    return;
                  }
                  editor
                    .chain()
                    .deleteRange(range)
                    .insertContent({
                      type: "mention",
                      attrs: {
                        mentionType: "page",
                        id: page.id,
                        label: page.title || title,
                        icon: page.icon,
                        shortId: page.shortId,
                      },
                    })
                    .run();
                  window.dispatchEvent(new CustomEvent("pages:refresh"));
                }
              );
            return;
          }

          editor
            .chain()
            .deleteRange(range)
            .insertContent({
              type: "mention",
              attrs: {
                mentionType: item.mentionType,
                id: item.id,
                label: item.label,
                icon: item.mentionType === "page" ? (item.icon ?? null) : null,
                shortId:
                  item.mentionType === "page" ? (item.shortId ?? null) : null,
              },
            })
            .run();
        },

        render: () => ({
          onStart: (props: MentionSuggestionProps) => opts.onUpdate(props),
          onUpdate: (props: MentionSuggestionProps) => opts.onUpdate(props),
          onKeyDown: (props: SuggestionKeyDownProps) =>
            opts.onKeyDown(props.event),
          onExit: () => opts.onUpdate(null),
        }),
      }),
    ];
  },
});

export function getMentionClass(mentionType: string): string {
  if (mentionType === "user") {
    return "text-primary font-medium bg-primary/6 rounded px-0.5 not-prose cursor-pointer";
  }
  if (mentionType === "page") {
    return "text-base-content underline decoration-dotted not-prose cursor-pointer";
  }
  return "text-primary font-medium not-prose cursor-pointer";
}
