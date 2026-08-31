"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth/client";

export function SignOutButton({
  children,
  className,
  title,
  ref,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  async function handleSignOut() {
    await signOut();
    window.location.href = "/auth/login";
  }

  const button = (
    <button
      className={className}
      onClick={handleSignOut}
      ref={ref}
      type="button"
    >
      {children}
    </button>
  );

  if (!title) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
