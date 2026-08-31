"use client";

import { useEffect, useState } from "react";

function formatTimeAgo(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  if (weeks < 5)  return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// formatTimeAgo() reads Date.now(), so it must not run during SSR — the value
// would differ from the client's first render (a "just now" gap or a minute
// tick) and trigger a hydration mismatch. Rendering null until mount keeps
// the server/client markup identical, then fills in and keeps itself fresh.
export function TimeAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(formatTimeAgo(iso));
    const id = setInterval(() => setLabel(formatTimeAgo(iso)), 60000);
    return () => clearInterval(id);
  }, [iso]);
  return <>{label}</>;
}
