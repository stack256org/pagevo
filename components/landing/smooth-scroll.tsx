"use client";

import { useEffect } from "react";

export function SmoothScroll() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith("#")) {
        return;
      }
      const el = document.querySelector(href);
      if (!el) {
        return;
      }
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
