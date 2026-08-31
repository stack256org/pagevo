"use client";

// Lets independent comment mutators (editor, cards, cell popovers) notify the
// header badge and gutter without prop-drilling.

const COMMENTS_CHANGED_EVENT = "pagevo:comments-changed";

export function emitCommentsChanged(pageId: string) {
  window.dispatchEvent(
    new CustomEvent(COMMENTS_CHANGED_EVENT, { detail: { pageId } })
  );
}

export function onCommentsChanged(
  pageId: string,
  callback: () => void
): () => void {
  function handler(e: Event) {
    const detail = (e as CustomEvent<{ pageId: string }>).detail;
    if (detail?.pageId === pageId) {
      callback();
    }
  }
  window.addEventListener(COMMENTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(COMMENTS_CHANGED_EVENT, handler);
}
