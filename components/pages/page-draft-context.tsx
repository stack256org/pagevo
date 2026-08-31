"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

interface PageDraftContextValue {
  isDraft: boolean;
  setIsDraft: (v: boolean) => void;
}

// Defaults to a safe no-op instead of throwing when unwrapped, since the editor
// is also rendered from hosts (e.g. entry-side-panel.tsx) that never provide it.
const NOOP_DRAFT_CONTEXT: PageDraftContextValue = {
  isDraft: false,
  setIsDraft: () => {},
};
const PageDraftContext =
  createContext<PageDraftContextValue>(NOOP_DRAFT_CONTEXT);

// Single source of truth for a page's "isDraft" flag, shared between the
// title-adjacent status pill and the editor's save handlers — a promotion
// response (PATCH or blocks/batch) flips this so the pill disappears live,
// with no page reload.
export function PageDraftProvider({
  initialIsDraft,
  children,
}: {
  initialIsDraft: boolean;
  children: ReactNode;
}) {
  const [isDraft, setIsDraft] = useState(initialIsDraft);
  return (
    <PageDraftContext.Provider value={{ isDraft, setIsDraft }}>
      {children}
    </PageDraftContext.Provider>
  );
}

export function usePageDraft() {
  return useContext(PageDraftContext);
}
