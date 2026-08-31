export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-200 animate-pulse px-4 py-6 sm:px-6 md:px-10 md:py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="size-12 shrink-0 rounded-md bg-base-200" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 rounded-sm bg-base-200" />
          <div className="h-3.5 w-56 rounded-sm bg-base-200/60" />
        </div>
      </div>

      {/* Card block 1 */}
      <div className="mb-5 rounded-lg border border-base-300 bg-base-100 p-5">
        <div className="mb-4 h-3.5 w-24 rounded bg-base-200/60" />
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-base-200" />
          <div className="flex flex-col gap-2.5">
            <div className="h-4 w-32 rounded bg-base-200" />
            <div className="h-3 w-48 rounded bg-base-200/60" />
          </div>
        </div>
      </div>

      {/* Card block 2 */}
      <div className="mb-5 rounded-lg border border-base-300 bg-base-100 p-5">
        <div className="mb-4 h-3.5 w-20 rounded bg-base-200/60" />
        <div className="space-y-3">
          <div className="h-9 w-full rounded-sm bg-base-200" />
          <div className="h-9 w-full rounded-sm bg-base-200" />
        </div>
      </div>

      {/* Card block 3 */}
      <div className="rounded-lg border border-base-300 bg-base-100 p-5">
        <div className="mb-4 h-3.5 w-28 rounded bg-base-200/60" />
        <div className="space-y-3">
          <div className="h-9 w-full rounded-sm bg-base-200" />
          <div className="h-9 w-3/4 rounded-sm bg-base-200" />
        </div>
      </div>
    </div>
  );
}
