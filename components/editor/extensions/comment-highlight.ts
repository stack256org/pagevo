import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";

export interface HighlightComment {
  anchorEnd: number;
  anchorStart: number;
  blockId: string | null;
  id: string;
}

export const COMMENT_HIGHLIGHT_KEY = new PluginKey<HighlightComment[]>(
  "commentHighlight"
);

export function setCommentHighlights(
  view: import("@tiptap/pm/view").EditorView,
  comments: HighlightComment[]
) {
  view.dispatch(view.state.tr.setMeta(COMMENT_HIGHLIGHT_KEY, comments));
}

export const CommentHighlight = Extension.create({
  name: "commentHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: COMMENT_HIGHLIGHT_KEY,
        state: {
          init: () => [] as HighlightComment[],
          apply(tr, val) {
            const meta = tr.getMeta(COMMENT_HIGHLIGHT_KEY) as
              | HighlightComment[]
              | undefined;
            return meta ?? val;
          },
        },
        props: {
          decorations(state) {
            const comments = COMMENT_HIGHLIGHT_KEY.getState(
              state
            ) as HighlightComment[];
            if (!comments?.length) {
              return DecorationSet.empty;
            }
            const decs = comments.flatMap((c) => {
              if (c.anchorStart == null || c.anchorEnd == null) {
                return [];
              }
              try {
                return [
                  Decoration.inline(c.anchorStart, c.anchorEnd, {
                    class: "comment-highlight",
                    "data-comment-id": c.id,
                    "data-block-id": c.blockId ?? "",
                  }),
                ];
              } catch {
                return [];
              }
            });
            return DecorationSet.create(state.doc, decs);
          },
        },
      }),
    ];
  },
});
