"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  workspaceSlug: string;
};

export function TrashSection({ workspaceSlug }: Props) {
  const pathname = usePathname();
  const href = `/app/${workspaceSlug}/trash`;
  const isActive = pathname === href;

  return (
    <Link
      className={`flex items-center gap-2.5 px-4 py-1.5 text-xs font-medium transition-colors ${
        isActive
          ? "bg-base-300 text-base-content"
          : "text-base-content/70 hover:bg-base-300 hover:text-base-content duration-150"
      }`}
      href={href}
    >
      <Trash2 size={14} />
      Trash
    </Link>
  );
}
