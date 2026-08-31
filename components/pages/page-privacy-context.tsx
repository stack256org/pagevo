"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

interface PagePrivacyContextValue {
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
}

const PagePrivacyContext = createContext<PagePrivacyContextValue | null>(null);

// Single source of truth for a page's "isPrivate" flag, shared between the
// title-adjacent status pill and the Share button/panel that actually
// changes it — both read/write the same state instead of maintaining their
// own copies and re-syncing after the fact.
export function PagePrivacyProvider({
  initialIsPrivate,
  children,
}: {
  initialIsPrivate: boolean;
  children: ReactNode;
}) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  return (
    <PagePrivacyContext.Provider value={{ isPrivate, setIsPrivate }}>
      {children}
    </PagePrivacyContext.Provider>
  );
}

export function usePagePrivacy() {
  const ctx = useContext(PagePrivacyContext);
  if (!ctx) {
    throw new Error("usePagePrivacy must be used within a PagePrivacyProvider");
  }
  return ctx;
}
