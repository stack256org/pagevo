"use client";

import { useEffect, useState } from "react";
import { SearchDialog } from "./search-dialog";

interface SearchProviderProps {
  children: React.ReactNode;
  workspaceId: string;
  workspaceSlug: string;
}

export function SearchProvider({
  workspaceSlug,
  workspaceId,
  children,
}: SearchProviderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Only open — when dialog is already open, its own Ctrl+K handler clears the query
        setOpen((prev) => (prev ? prev : true));
      }
    }
    function handleEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("pagevo:open-search", handleEvent);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pagevo:open-search", handleEvent);
    };
  }, []);

  return (
    <>
      {children}
      {open && (
        <SearchDialog
          onClose={() => {
            setOpen(false);
            document.dispatchEvent(new CustomEvent("pagevo:search-closed"));
          }}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      )}
    </>
  );
}
