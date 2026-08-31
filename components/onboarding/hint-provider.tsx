"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface HintContextValue {
  dismiss: (key: string) => void;
  isDismissed: (key: string) => boolean;
}

const HintContext = createContext<HintContextValue | null>(null);

export function useHints(): HintContextValue {
  const ctx = useContext(HintContext);
  if (!ctx) {
    throw new Error("useHints must be inside HintProvider");
  }
  return ctx;
}

interface Props {
  children: React.ReactNode;
  dismissed: string[]; // hint keys already dismissed, fetched server-side
}

export function HintProvider({ children, dismissed }: Props) {
  const [dismissedSet, setDismissedSet] = useState<Set<string>>(
    () => new Set(dismissed)
  );

  const isDismissed = useCallback(
    (key: string) => dismissedSet.has(key),
    [dismissedSet]
  );

  const dismiss = useCallback((key: string) => {
    setDismissedSet((prev) => new Set([...prev, key]));
    fetch("/api/onboarding/dismiss-hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hintKey: key }),
    }).catch(() => {});
  }, []);

  return (
    <HintContext.Provider value={{ isDismissed, dismiss }}>
      {children}
    </HintContext.Provider>
  );
}
