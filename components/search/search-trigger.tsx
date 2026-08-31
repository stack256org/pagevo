"use client";

export function SearchTrigger() {
  return (
    <button
      className="flex h-8 w-44 items-center justify-between rounded-sm border border-base-300 bg-base-200/40 px-3 text-base-content/70 transition-colors hover:border-primary/40 hover:bg-base-200"
      onClick={() =>
        document.dispatchEvent(new CustomEvent("pagevo:open-search"))
      }
      type="button"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <svg
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" x2="16.65" y1="21" y2="16.65" />
        </svg>
        <span className="truncate whitespace-nowrap text-left text-xs">
          Search anything…
        </span>
      </div>
      <kbd className="ml-3 shrink-0 rounded-xs bg-base-200 px-1.5 py-px text-2xs font-medium text-base-content/70">
        ⌘K
      </kbd>
    </button>
  );
}
