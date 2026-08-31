export default function WorkspaceHomeLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-base-100 animate-pulse">
      {/* Topbar skeleton */}
      <div className="shrink-0 bg-base-100">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-24 rounded-sm bg-base-200" />
            <div className="h-5 w-48 rounded-sm bg-base-200" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-sm bg-base-200" />
            <div className="h-8 w-28 rounded-sm bg-base-200" />
          </div>
        </div>
      </div>

      {/* Body skeleton */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-300 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_256px] gap-5 items-start">
            {/* Left column */}
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
                <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
                  <div className="h-4 w-32 rounded bg-base-200" />
                  <div className="h-3 w-16 rounded bg-base-200/60" />
                </div>
                <div className="divide-y divide-base-300">
                  {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
                  {[...new Array(5)].map((_, i) => (
                    <div
                      className="flex items-center gap-3 px-5 py-2.5"
                      key={i}
                    >
                      <div className="size-7 shrink-0 rounded-sm bg-base-200" />
                      <div className="h-3.5 flex-1 rounded bg-base-200" />
                      <div className="h-3 w-12 shrink-0 rounded bg-base-200/60" />
                    </div>
                  ))}
                  {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
                <div className="border-b border-base-300 px-4 py-2.5">
                  <div className="h-2.5 w-16 rounded bg-base-200/60" />
                </div>
                <div className="divide-y divide-base-300">
                  {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
                  {[...new Array(3)].map((_, i) => (
                    <div
                      className="flex items-center justify-between px-4 py-2.5"
                      key={i}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="size-6 rounded-sm bg-base-200" />
                        <div className="h-3 w-16 rounded bg-base-200/60" />
                      </div>
                      <div className="h-5 w-8 rounded bg-base-200" />
                    </div>
                  ))}
                  {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
