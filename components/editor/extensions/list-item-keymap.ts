import { ListItem } from "@tiptap/extension-list";
import TaskItem from "@tiptap/extension-task-item";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

// This schema treats every list block as a one-item container (see serializer.ts); stock
// splitListItem/sinkListItem would insert/nest a second item that the serializer never reads back, silently
// dropping it on reload. Override Enter to create a new sibling container instead, and no-op Tab.
function splitIntoNewBlock(
  editor: Editor,
  itemTypeName: string,
  validContainerTypes: string[]
): boolean {
  return editor.commands.command(({ tr, dispatch, state }) => {
    if (!tr.selection.empty) {
      tr.deleteSelection();
    }
    const $from = tr.selection.$from;

    let itemDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === itemTypeName) {
        itemDepth = d;
        break;
      }
    }
    if (itemDepth === -1 || itemDepth < 1) {
      return false;
    }
    const containerDepth = itemDepth - 1;
    const containerNode = $from.node(containerDepth);
    if (
      !validContainerTypes.includes(containerNode.type.name) ||
      containerNode.childCount !== 1
    ) {
      // Not a plain one-item container (e.g. legacy/corrupted content with a
      // pre-existing multi-item list) — fall back to stock behavior rather
      // than risk mangling content we don't understand.
      return false;
    }

    const containerStart = $from.before(containerDepth);
    const containerEnd = $from.after(containerDepth);
    const itemNode = $from.node(itemDepth);
    const paragraphNode = itemNode.firstChild;
    const isEmpty = !paragraphNode || paragraphNode.content.size === 0;

    if (isEmpty) {
      // Exit the list on Enter at an empty item, same as Notion.
      const paragraph = state.schema.nodes.paragraph.create();
      tr.replaceWith(containerStart, containerEnd, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, containerStart + 1));
    } else {
      const newItem = itemNode.type.create(
        null,
        state.schema.nodes.paragraph.create()
      );
      // Reset blockId — reusing the source container's id would give two top-level nodes the same
      // id and collapse them into one DB row on save.
      const newContainer = containerNode.type.create(
        { ...containerNode.attrs, blockId: null },
        newItem
      );
      tr.insert(containerEnd, newContainer);
      tr.setSelection(TextSelection.create(tr.doc, containerEnd + 3));
    }

    if (dispatch) {
      dispatch(tr.scrollIntoView());
    }
    return true;
  });
}

export const ListItemBlock = ListItem.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        splitIntoNewBlock(this.editor, "listItem", [
          "bulletList",
          "orderedList",
        ]),
      Tab: () => true,
    };
  },
});

export const TaskItemBlock = TaskItem.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => splitIntoNewBlock(this.editor, "taskItem", ["taskList"]),
    };
  },
});
