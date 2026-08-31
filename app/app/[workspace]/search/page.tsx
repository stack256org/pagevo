"use client";

import { useEffect } from "react";

// This page just fires the search modal event — the modal is mounted in the workspace layout.
export default function SearchPage() {
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("pagevo:open-search"));
  }, []);

  return null;
}
