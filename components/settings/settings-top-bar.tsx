"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  Bell,
  ChevronRight,
  Home,
  Menu,
  Search,
  Settings,
  Shield,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { useSettingsUser } from "./settings-user-context";

interface Props {
  workspaceName: string;
  workspaceSlug: string;
}

function getNavItems(slug: string) {
  const base = `/app/${slug}/settings`;
  return [
    { label: "My profile", href: `${base}/profile`, icon: User },
    { label: "Notifications", href: `${base}/notifications`, icon: Bell },
    { label: "Security & sessions", href: `${base}/sessions`, icon: Shield },
    { label: "General", href: `${base}/general`, icon: Settings },
    { label: "Members", href: `${base}/members`, icon: Users },
  ];
}

export function SettingsTopBar({ workspaceSlug, workspaceName }: Props) {
  const { user } = useSettingsUser();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const displayName = user.name?.trim() || user.email;
  const initials = getInitials(displayName);
  const bg = getAvatarColor(displayName);
  const profileHref = `/app/${workspaceSlug}/settings/profile`;

  const navItems = getNavItems(workspaceSlug);
  const results = search.trim()
    ? navItems.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between bg-base-100 px-3">
        {/* Mobile hamburger */}
        <button
          aria-label="Toggle navigation"
          className="flex size-8 items-center justify-center rounded-sm text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content md:hidden"
          onClick={() => setMobileNav((v) => !v)}
          type="button"
        >
          {mobileNav ? <X size={16} /> : <Menu size={16} />}
        </button>

        {/* Breadcrumb — matches library/templates topbar style */}
        <nav className="hidden min-w-0 items-center gap-0.5 text-xs md:flex">
          <Link
            className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-base-content transition-colors hover:bg-base-200"
            href={`/app/${workspaceSlug}`}
          >
            <Home className="shrink-0 text-base-content" size={13} />
            <span className="font-medium">{workspaceName}</span>
          </Link>
          <ChevronRight className="shrink-0 text-base-content/40" size={12} />
          <span className="px-2 py-1 font-semibold text-base-content/80">
            Settings
          </span>
        </nav>

        {/* Right — search + avatar */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Combobox
              onChange={() => setSearch("")}
              onClose={() => setSearch("")}
              value={null as string | null}
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/70"
                  size={13}
                />
                <ComboboxInput
                  className="h-7 w-40 rounded-md border border-base-300 bg-base-200/40 pl-8 pr-3 text-xs text-base-content placeholder:text-base-content/50 transition-colors focus:border-primary/50 focus:bg-base-200 focus:outline-none focus:ring-1 focus:ring-primary/20 md:w-50"
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search settings…"
                  value={search}
                />
              </div>
              {search.trim() !== "" && (
                <ComboboxOptions
                  anchor={{ to: "bottom end", gap: 4 }}
                  className="z-600 w-55 overflow-hidden rounded-md border border-base-300 bg-neutral p-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
                  transition
                >
                  {results.length > 0 ? (
                    results.map((item) => {
                      const Icon = item.icon;
                      return (
                        <ComboboxOption key={item.href} value={item.href}>
                          <Link
                            className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-base-content/80 transition-colors data-focus:bg-base-200 data-focus:text-base-content hover:bg-base-200 hover:text-base-content"
                            href={item.href}
                            onClick={() => setSearch("")}
                          >
                            <Icon
                              className="shrink-0 text-base-content/70"
                              size={14}
                            />
                            {item.label}
                          </Link>
                        </ComboboxOption>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-xs text-base-content/70">
                      No results for &ldquo;{search}&rdquo;
                    </div>
                  )}
                </ComboboxOptions>
              )}
            </Combobox>
          </div>

          {/* Avatar with hover card */}
          <div className="group relative">
            <Link className="flex items-center rounded-full" href={profileHref}>
              {user.image ? (
                // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
                <img
                  alt={displayName}
                  className="size-7 rounded-full object-cover ring-1 ring-base-300 transition-all group-hover:ring-primary/40 group-focus-within:ring-primary/40"
                  src={user.image}
                />
              ) : (
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${bg}`}
                >
                  {initials}
                </div>
              )}
            </Link>

            {/* Hover card — focus-within alongside hover so keyboard users
                tabbing to the avatar link also see it, not just mouse hover. */}
            <div className="pointer-events-none invisible absolute right-0 top-[calc(100%+8px)] z-200 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="min-w-50 overflow-hidden rounded-xl border border-base-300 bg-base-100">
                <div className="flex items-center gap-3 px-4 py-3">
                  {user.image ? (
                    // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
                    <img
                      alt={displayName}
                      className="size-9 shrink-0 rounded-full object-cover"
                      src={user.image}
                    />
                  ) : (
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${bg}`}
                    >
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-base-content">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-base-content/70">
                      {user.email}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile nav drawer (below the top bar, above content) */}
      {mobileNav && (
        <div className="shrink-0 border-b border-base-300 bg-base-200 px-2 py-2 md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href.includes("profile")
              ? pathname === item.href.replace("/profile", "") ||
                pathname.startsWith(item.href)
              : pathname.startsWith(item.href);
            return (
              <Link
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-base-content/70 hover:bg-primary/10 hover:text-primary"
                }`}
                href={item.href}
                key={item.href}
                onClick={() => setMobileNav(false)}
              >
                <Icon
                  className={
                    isActive
                      ? "text-primary"
                      : "text-base-content/60 group-hover:text-primary"
                  }
                  size={14}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
