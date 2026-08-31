"use client";

import { Bell, Lock, Settings, Shield, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  isAdmin: boolean;
  workspaceIcon: string | null;
  workspaceName: string;
  workspaceSlug: string;
}

export function SettingsNav({
  workspaceSlug,
  workspaceIcon: _workspaceIcon,
  isAdmin,
}: Props) {
  const pathname = usePathname();
  const base = `/app/${workspaceSlug}/settings`;

  function active(key: string) {
    if (key === "profile") {
      return pathname === base || pathname.startsWith(`${base}/profile`);
    }
    return pathname.startsWith(`${base}/${key}`);
  }

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-base-300 bg-base-200 md:flex">
      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        {/* Account */}
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-primary/60">
          Account
        </p>
        <div className="space-y-0.5">
          <NavItem
            active={active("profile")}
            href={`${base}/profile`}
            icon={<User size={14} />}
            label="My profile"
          />
          <NavItem
            active={active("notifications")}
            href={`${base}/notifications`}
            icon={<Bell size={14} />}
            label="Notifications"
          />
          <NavItem
            active={active("sessions")}
            href={`${base}/sessions`}
            icon={<Shield size={14} />}
            label="Security & sessions"
          />
        </div>

        <div className="mx-1 my-3 h-px bg-base-300" />

        {/* Workspace */}
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-primary/60">
          Workspace
        </p>
        <div className="space-y-0.5">
          {isAdmin ? (
            <NavItem
              active={active("general")}
              href={`${base}/general`}
              icon={<Settings size={14} />}
              label="General"
            />
          ) : (
            <LockedItem icon={<Settings size={14} />} label="General" />
          )}
          <NavItem
            active={active("members")}
            href={`${base}/members`}
            icon={<Users size={14} />}
            label="Members"
          />
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150 ${
        active
          ? "bg-primary/10 text-primary"
          : "text-base-content/70 hover:bg-primary/10 hover:text-primary"
      }`}
      href={href}
    >
      <span
        className={`shrink-0 transition-colors duration-150 ${
          active
            ? "text-primary"
            : "text-base-content/60 group-hover:text-primary"
        }`}
      >
        {icon}
      </span>
      <span className={active ? "font-semibold" : ""}>{label}</span>
    </Link>
  );
}

function LockedItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-base-content/70">
      <span className="shrink-0 text-base-content/60">{icon}</span>
      <span>{label}</span>
      <Lock className="ml-auto text-base-content/70" size={11} />
    </div>
  );
}
