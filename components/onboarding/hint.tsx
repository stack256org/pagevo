"use client";

import { X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHints } from "./hint-provider";

interface Props {
  children: React.ReactNode;
  hintKey: string;
  icon?: string;
}

export function Hint({ hintKey, children, icon = "💡" }: Props) {
  const { isDismissed, dismiss } = useHints();

  if (isDismissed(hintKey)) {
    return null;
  }

  return (
    <div className="group flex items-start gap-2.5 rounded-md border border-base-300 bg-base-200/20 px-4 py-3 text-xs text-base-content/70">
      <span className="mt-px shrink-0 text-base leading-none">{icon}</span>
      <span className="flex-1 leading-relaxed">{children}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded text-base-content/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-base-content"
            onClick={() => dismiss(hintKey)}
            type="button"
          >
            <X size={10} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Dismiss</TooltipContent>
      </Tooltip>
    </div>
  );
}
