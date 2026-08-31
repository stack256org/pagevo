"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-controls="mobile-nav-menu"
        aria-expanded={open}
        aria-label="Toggle menu"
        className="flex size-9 items-center justify-center rounded-sm text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content sm:hidden"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {open ? <X size={16} /> : <Menu size={16} />}
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-40 border-b border-base-300 bg-base-200/95 px-6 py-4 backdrop-blur-md sm:hidden"
          id="mobile-nav-menu"
        >
          <nav className="flex flex-col gap-1">
            {[
              { label: "Features", href: "#features" },
              { label: "How it works", href: "#how-it-works" },
              { label: "For teams", href: "#for-teams" },
            ].map(({ label, href }) => (
              <a
                className="rounded-sm px-3 py-2.5 text-sm font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                href={href}
                key={href}
                onClick={() => setOpen(false)}
              >
                {label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-base-300 pt-3">
              <Link
                className="flex w-full items-center justify-center rounded-sm bg-primary py-2.5 text-sm font-semibold text-primary-content"
                href="/auth/login"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
