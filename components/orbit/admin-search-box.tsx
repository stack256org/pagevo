"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Props {
  placeholder: string;
}

// Debounced search box that drives the page via the `q` URL param — keeps
// list pages as Server Components (Rule 11) instead of pulling the whole
// table + filtering client-side.
export function AdminSearchBox({ placeholder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  function onChange(next: string) {
    setValue(next);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) {
        params.set("q", next.trim());
      } else {
        params.delete("q");
      }
      params.delete("page"); // any new search starts back at page 1
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
  }

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/70"
        size={14}
      />
      <input
        aria-label={placeholder}
        className="h-9 w-full min-w-55 rounded-md border border-base-300 bg-base-100 pl-9 pr-3 text-sm text-base-content placeholder:text-base-content/50 outline-none transition-colors focus:border-primary/50 sm:w-64"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </div>
  );
}
