"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

const SHOW_AFTER_PX = 400;

// Floats bottom-right once the admin scroll container has scrolled past a
// threshold — lets a long list (e.g. Templates) stay a single scannable
// page instead of being split into paginated chunks.
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById("orbit-admin-scroll");
    if (!el) {
      return;
    }
    function onScroll() {
      setVisible(el!.scrollTop > SHOW_AFTER_PX);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 py-2 text-xs font-semibold text-base-content transition-colors duration-150 hover:bg-base-200"
      onClick={() =>
        document
          .getElementById("orbit-admin-scroll")
          ?.scrollTo({ top: 0, behavior: "smooth" })
      }
      type="button"
    >
      <ArrowUp size={13} />
      Top
    </button>
  );
}
