export default function TemplatesLoading() {
  return (
    <div className="flex h-full flex-col bg-base-100 animate-pulse">
      {/* Topbar skeleton — h-11/px-3 mirrors the real header in
          templates-page-client.tsx exactly, so it doesn't jump on load. */}
      <div className="flex h-11 shrink-0 items-center border-b border-base-300 px-3">
        <div className="h-4 w-28 rounded-sm bg-base-200" />
      </div>

      {/* Category filter skeleton */}
      <div className="flex gap-2 border-b border-base-300 px-6 py-3">
        {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
        {[...new Array(5)].map((_, i) => (
          <div className="h-7 w-20 rounded-full bg-base-200" key={i} />
        ))}
        {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
      </div>

      {/* Template card grid skeleton */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="grid grid-cols-3 gap-4">
          {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
          {[...new Array(9)].map((_, i) => (
            <div
              className="overflow-hidden rounded-lg border border-base-300 bg-base-100"
              key={i}
            >
              <div className="h-28 w-full bg-base-200" />
              <div className="p-4">
                <div className="mb-2 h-4 w-3/4 rounded bg-base-200" />
                <div className="h-3 w-full rounded bg-base-200/60" />
                <div className="mt-1 h-3 w-2/3 rounded bg-base-200/60" />
              </div>
            </div>
          ))}
          {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
        </div>
      </div>
    </div>
  );
}
