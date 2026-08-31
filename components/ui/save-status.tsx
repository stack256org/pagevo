"use client";

import { Check, Dot, Loader2, WifiOff } from "lucide-react";

// "unsaved" only applies to editors that save explicitly rather than
// autosaving (the Orbit template builder) — autosaving callers never enter it.
export type SaveState = "idle" | "saving" | "saved" | "offline" | "unsaved";

interface Props {
  state: SaveState;
  className?: string;
}

// One consistent look for the "Saving… / Saved / Offline" autosave indicator
// — previously reimplemented separately per editor with different icons (or
// none at all) and wording each time. Purely presentational: the caller owns
// the state machine and any auto-hide timing.
export function SaveStatusIndicator({ state, className = "" }: Props) {
  if (state === "idle") return null;

  return (
    // daisyUI `badge` — this indicator is a pill with an icon and a short
    // label, which is exactly what `badge` is. `rounded-full` keeps the pill
    // shape (the app's `badge` sits on `--radius-xs`), and the two colour
    // pairs stay as alpha-tinted tokens rather than daisy's `badge-warning`
    // /`badge-neutral`, which are opaque fills.
    <div
      className={`badge badge-sm h-auto gap-1.5 rounded-full py-0.5 font-medium transition-opacity duration-300 select-none ${
        state === "offline"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-base-300 bg-base-200/60 text-base-content/70"
      } ${className}`}
    >
      {state === "saving" && (
        <>
          <Loader2 size={11} className="animate-spin" />
          Saving…
        </>
      )}
      {state === "saved" && (
        <>
          <Check size={11} className="text-success" />
          Saved
        </>
      )}
      {state === "unsaved" && (
        <>
          <Dot size={11} className="text-warning" />
          Unsaved changes
        </>
      )}
      {state === "offline" && (
        <>
          <WifiOff size={11} />
          Offline — changes will sync when reconnected
        </>
      )}
    </div>
  );
}
