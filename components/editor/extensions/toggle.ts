import { Plugin } from "@tiptap/pm/state";
import { mergeAttributes, Node } from "@tiptap/react";

// The `open` flag is stored in node attrs so TipTap re-renders <details> with
// or without the HTML `open` attribute. CSS then handles show/hide, which works
// because contenteditable doesn't respect native <details> toggling.

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "toggleSummary block*",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      open: {
        default: false,
        // Reflect state as the HTML boolean attribute `open`
        renderHTML: (attrs) => (attrs.open ? { open: "" } : {}),
        parseHTML: (el) => (el as HTMLElement).hasAttribute("open"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "details" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["details", mergeAttributes(HTMLAttributes), 0];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              const target = event.target as HTMLElement;
              const summary =
                target.tagName === "SUMMARY"
                  ? target
                  : (target.closest?.("summary") as HTMLElement | null);
              if (!summary) {
                return false;
              }

              event.preventDefault();

              // Resolve a ProseMirror position inside the clicked <summary>
              const clickPos = view.posAtDOM(summary, 0);
              if (clickPos < 0) {
                return false;
              }
              const $pos = view.state.doc.resolve(clickPos);

              // Walk up ancestor depths to find the toggle node
              for (let d = $pos.depth; d > 0; d--) {
                const node = $pos.node(d);
                if (node.type.name === "toggle") {
                  view.dispatch(
                    view.state.tr.setNodeMarkup($pos.before(d), undefined, {
                      ...node.attrs,
                      open: !node.attrs.open,
                    })
                  );
                  return true;
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

export const ToggleSummary = Node.create({
  name: "toggleSummary",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML() {
    return ["summary", 0];
  },
});
