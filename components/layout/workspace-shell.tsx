"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

export function WorkspaceShell({ sidebar, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // SheetContent is an inherently-modal native <dialog>, can't double as the in-flow desktop
  // sidebar, so exactly one of the two wrappers renders based on JS-detected viewport;
  // `hidden md:block` covers the SSR-to-hydration gap before useIsMobile's effect runs, avoiding a flash of the full sidebar on mobile.
  const isMobile = useIsMobile();

  return (
    <div className="flex h-dvh overflow-hidden bg-base-100">
      {isMobile ? (
        <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
          <SheetContent
            className="w-auto max-w-none border-0 bg-transparent p-0"
            showCloseButton={false}
            side="left"
          >
            {sidebar}
          </SheetContent>
        </Sheet>
      ) : (
        // md:relative md:z-550 creates a stacking context so sidebar dropdowns (none of which
        // portal to body) paint above the main content's own popovers (z-500); stays below full-screen modals (z-580+).
        <div
          className="hidden shrink-0 md:relative md:z-550 md:block"
          id="workspace-sidebar"
        >
          {sidebar}
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile-only top bar */}
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-base-300 bg-base-100 px-4 md:hidden">
          <button
            aria-label="Open sidebar"
            className="flex size-8 items-center justify-center rounded-sm text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu size={17} />
          </button>
          <Image
            alt="Pagevo"
            className="size-7 rounded-sm"
            height={28}
            src="/favicon-32x32.png"
            unoptimized
            width={28}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
