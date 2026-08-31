export default function LibraryLoading() {
  return (
    <div className="flex h-full flex-col bg-base-100 animate-pulse">
      {/* Topbar skeleton */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-base-300 px-6">
        <div className="h-5 w-24 rounded-sm bg-base-200" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-32 rounded-sm bg-base-200" />
          <div className="h-8 w-24 rounded-sm bg-base-200" />
        </div>
      </div>

      {/* Table header skeleton */}
      <div className="flex items-center gap-4 border-b border-base-300 px-6 py-2.5">
        <div className="h-3 w-48 rounded bg-base-200" />
        <div className="ml-auto h-3 w-24 rounded bg-base-200/60" />
        <div className="h-3 w-20 rounded bg-base-200/60" />
      </div>

      {/* Page rows skeleton */}
      <div className="flex-1 overflow-hidden divide-y divide-base-300">
        {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
        {[...new Array(10)].map((_, i) => (
          <div className="flex items-center gap-3 px-6 py-3" key={i}>
            <div className="size-6 shrink-0 rounded-sm bg-base-200" />
            <div className="h-3.5 w-48 rounded bg-base-200" />
            <div className="ml-auto h-3 w-24 shrink-0 rounded bg-base-200/60" />
            <div className="h-3 w-20 shrink-0 rounded bg-base-200/60" />
          </div>
        ))}
        {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
      </div>
    </div>
  );
}
