import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface Props {
  basePath: string;
  page: number;
  pageSize: number;
  query: string; // current ?q= value, empty string if none
  totalCount: number;
}

// Prev/Next pager built as plain <Link>s — keeps navigation a server-driven
// hard cut (Rule 31) instead of a client-side fetch-and-reflow.
export function PaginationControls({
  page,
  pageSize,
  totalCount,
  basePath,
  query,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) {
    return null;
  }

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  function hrefFor(p: number) {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    if (p > 1) {
      params.set("page", String(p));
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-base-300 bg-base-100 px-5 py-3">
      <p className="text-xs text-base-content/70">
        Showing{" "}
        <span className="font-semibold text-base-content">
          {from}–{to}
        </span>{" "}
        of <span className="font-semibold text-base-content">{totalCount}</span>
      </p>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link
            className="flex items-center gap-1 rounded-sm border border-base-300 px-2.5 py-1.5 text-xs font-medium text-base-content transition-colors hover:bg-base-200"
            href={hrefFor(page - 1)}
          >
            <ChevronLeft size={12} /> Prev
          </Link>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border border-base-300 px-2.5 py-1.5 text-xs font-medium text-base-content/50">
            <ChevronLeft size={12} /> Prev
          </span>
        )}
        <span className="px-2 text-xs font-medium text-base-content/70">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            className="flex items-center gap-1 rounded-sm border border-base-300 px-2.5 py-1.5 text-xs font-medium text-base-content transition-colors hover:bg-base-200"
            href={hrefFor(page + 1)}
          >
            Next <ChevronRight size={12} />
          </Link>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border border-base-300 px-2.5 py-1.5 text-xs font-medium text-base-content/50">
            Next <ChevronRight size={12} />
          </span>
        )}
      </div>
    </div>
  );
}
