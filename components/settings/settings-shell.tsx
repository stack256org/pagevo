"use client";

import { useParams, useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Props {
  children: React.ReactNode;
}

export function SettingsShell({ children }: Props) {
  const router = useRouter();
  const params = useParams<{ workspace: string }>();

  function close() {
    router.push(`/app/${params.workspace}`);
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent className="top-10 left-1/2 flex h-[calc(100vh-60px)] w-full max-w-300 sm:max-w-300 -translate-x-1/2 translate-y-0 gap-0 overflow-hidden rounded-lg border border-base-300 bg-base-100 p-0 text-base-content ring-0">
        {children}
      </DialogContent>
    </Dialog>
  );
}
