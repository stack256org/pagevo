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

export function AdminShell({ sidebar, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // See workspace-shell.tsx — picks exactly one wrapper via JS viewport detection (not
  // mounting sidebar twice) since Sheet's SheetContent is a modal <dialog>, can't double as the in-flow desktop sidebar.
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
        <div className="hidden shrink-0 md:block">{sidebar}</div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile-only top bar */}
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-base-300 bg-base-100/95 px-4 md:hidden">
          <button
            aria-label="Open sidebar"
            className="flex size-8 items-center justify-center rounded-sm text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu size={17} />
          </button>
          <div className="flex items-center gap-2">
            <Image
              alt="Pagevo"
              className="size-7 rounded-sm"
              height={28}
              src="/favicon-32x32.png"
              unoptimized
              width={28}
            />
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
              Orbit Admin
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
