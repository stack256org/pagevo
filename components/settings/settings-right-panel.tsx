"use client";

import { Bell, Settings, Shield, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Section {
  adminOnly?: boolean;
  group: "account" | "workspace";
  icon: React.ReactNode;
  key: string;
  label: string;
}

const SECTIONS: Section[] = [
  {
    key: "profile",
    label: "My profile",
    icon: <User size={14} />,
    group: "account",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: <Bell size={14} />,
    group: "account",
  },
  {
    key: "sessions",
    label: "Security & sessions",
    icon: <Shield size={14} />,
    group: "account",
  },
  {
    key: "general",
    label: "General",
    icon: <Settings size={14} />,
    group: "workspace",
    adminOnly: true,
  },
  {
    key: "members",
    label: "Members",
    icon: <Users size={14} />,
    group: "workspace",
  },
];

interface Props {
  isAdmin: boolean;
  workspaceSlug: string;
}

export function SettingsRightPanel({ workspaceSlug, isAdmin }: Props) {
  const pathname = usePathname();
  const base = `/app/${workspaceSlug}/settings`;

  function isActive(key: string) {
    if (key === "profile") {
      return pathname === base || pathname.startsWith(`${base}/profile`);
    }
    return pathname.startsWith(`${base}/${key}`);
  }

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const accountSections = visibleSections.filter((s) => s.group === "account");
  const workspaceSections = visibleSections.filter(
    (s) => s.group === "workspace"
  );

  return (
    <aside className="flex w-65 shrink-0 flex-col border-r border-base-300 bg-base-200">
      {/* Header */}
      <div className="border-b border-base-300 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
          Categories
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Account group */}
        <div className="mb-2.5 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/60">
            Account
          </p>
        </div>
        <div className="space-y-0.5">
          {accountSections.map((s) => (
            <SectionRow
              active={isActive(s.key)}
              href={`${base}/${s.key}`}
              icon={s.icon}
              key={s.key}
              label={s.label}
            />
          ))}
        </div>

        {/* Workspace group */}
        <div className="mb-2.5 mt-4 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/60">
            Workspace
          </p>
        </div>
        <div className="space-y-0.5">
          {workspaceSections.map((s) => (
            <SectionRow
              active={isActive(s.key)}
              href={`${base}/${s.key}`}
              icon={s.icon}
              key={s.key}
              label={s.label}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function SectionRow({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 transition-all duration-150 ${
        active
          ? "bg-primary/10 text-primary"
          : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
      }`}
      href={href}
    >
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 ${
          active
            ? "bg-primary/15 text-primary"
            : "bg-base-200/70 text-base-content/70 group-hover:bg-primary/10 group-hover:text-base-content"
        }`}
      >
        {icon}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm ${active ? "font-semibold" : "font-medium"}`}
      >
        {label}
      </span>
    </Link>
  );
}
