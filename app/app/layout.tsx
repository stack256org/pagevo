import type { ReactNode } from "react";
import { requireSession } from "@/lib/authz";

// Session guard for all app routes — redirects to /login if unauthenticated.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <>{children}</>;
}
