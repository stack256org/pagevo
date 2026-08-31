"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Share2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { usePagePrivacy } from "@/components/pages/page-privacy-context";
import { SharePanel } from "@/components/pages/share-panel";

interface Props {
  currentUserEmail: string | null;
  currentUserId: string;
  currentUserImage: string | null;
  currentUserName: string | null;
  isEditor: boolean;
  pageId: string;
  pageShortId: string;
  workspaceSlug: string;
}

export function ShareButton({
  pageId,
  pageShortId,
  workspaceSlug,
  currentUserId,
  currentUserName,
  currentUserEmail,
  currentUserImage,
}: Props) {
  const { isPrivate: pagePrivate, setIsPrivate: setPagePrivate } =
    usePagePrivacy();
  const btnRef = useRef<HTMLButtonElement>(null);

  // Lets CopyLinkButton (a topbar sibling with no shared state) reopen this
  // same panel for its "Give access" action on a private-page link copy.
  // Popover has no externally-controlled open prop, so this simulates the same click gesture that opens it normally (no-op if already open).
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ pageId: string }>).detail;
      if (detail?.pageId !== pageId) {
        return;
      }
      const btn = btnRef.current;
      if (btn && btn.getAttribute("aria-expanded") !== "true") {
        btn.click();
      }
    }
    window.addEventListener("pagevo:open-share", handler);
    return () => window.removeEventListener("pagevo:open-share", handler);
  }, [pageId]);

  const handlePrivateToggle = useCallback(
    async (next: boolean) => {
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: next }),
      });
      setPagePrivate(next);
      // Moves the page into/out of the sidebar's Private section right away —
      // otherwise it only updates when the page-tree SSE poll next fires (4s
      // server-side), which read as a ~5s lag.
      window.dispatchEvent(new CustomEvent("pages:refresh"));
    },
    [pageId, setPagePrivate]
  );

  return (
    <Popover>
      {({ close }) => (
        <>
          <PopoverButton
            className="flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-content transition-all hover:bg-primary/90 active:scale-[0.97]"
            ref={btnRef}
          >
            <Share2 size={14} />
            Share
          </PopoverButton>

          <PopoverPanel
            anchor={{ to: "bottom end", gap: 8 }}
            className="z-600 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
            transition
          >
            <SharePanel
              currentUserEmail={currentUserEmail}
              currentUserId={currentUserId}
              currentUserImage={currentUserImage}
              currentUserName={currentUserName}
              isPrivate={pagePrivate}
              onClose={close}
              onPrivateToggle={handlePrivateToggle}
              pageId={pageId}
              pageShortId={pageShortId}
              workspaceSlug={workspaceSlug}
            />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
