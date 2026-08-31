"use client";

import { Check, File as FileIcon, ThumbsUp } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { NumberFormat } from "@/components/database/property-registry";
import {
  formatDateValue,
  formatNumber,
  getOptionColor,
} from "@/components/database/property-registry";
import type {
  DbProperty,
  FileItem,
  SelectOption,
} from "@/components/database/types";
import { UserHoverCard } from "@/components/database/user-hover-card";
import { ImageLightbox } from "@/components/editor/comment-card";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useSession } from "@/lib/auth/client";
import { formatReactorNames } from "@/lib/comments/format-reaction-tooltip";

interface CellDisplayProps {
  compact?: boolean;
  /** When set, a checkbox-display select/status property renders as a real
   *  button that toggles in place instead of plain read-only text — used by
   *  the calendar card so a checkbox-style property can be checked/unchecked
   *  right there, without opening the entry's own full page. */
  onToggleCheckbox?: () => void;
  property: DbProperty;
  /** Resolved by the caller (view-property-resolver.ts) so the same Status property can render
   *  differently per view (e.g. checkbox in Board, badge elsewhere); falls back to property.config. */
  resolvedDisplayAs?: "select" | "checkbox";
  resolvedWrapContent?: boolean;
  value: unknown;
  /** Person/Created-by avatar chips show a Notion-style hover card (name,
   *  role, local time) when this is supplied — every call site already has
   *  it in scope, so omitting it is only ever a deliberate opt-out. */
  workspaceId?: string;
}

// Native input (not hand-drawn svg) gives role="checkbox"/aria-checked for free; `data-slot="checkbox"` + `peer`
// mirror checkbox.tsx's convention. Visual state driven off `checked` prop, not CSS :checked, per checkbox.tsx.
function CheckboxGlyph({
  checked,
  id,
  onToggle,
}: {
  checked: boolean;
  id?: string;
  onToggle?: () => void;
}) {
  return (
    <span
      className={`peer relative inline-flex size-4 shrink-0 items-center justify-center ${onToggle ? "cursor-pointer" : "cursor-default"}`}
      data-slot="checkbox"
    >
      <input
        checked={checked}
        className={`absolute inset-0 size-full cursor-[inherit] appearance-none rounded-[3px] border bg-transparent outline-none transition-colors ${
          checked ? "border-primary bg-primary" : "border-base-content/70"
        }`}
        id={id}
        onChange={onToggle ? () => onToggle() : undefined}
        // Kept on the input rather than the wrapping <label> below: the input
        // is absolutely positioned over the whole glyph, so it is the direct
        // target of a glyph click. Verified there is no clickable ancestor in
        // either consumer of the label branch (gallery + calendar cards open
        // via a sibling title link, not a row-level handler).
        onClick={onToggle ? (e) => e.stopPropagation() : undefined}
        readOnly={!onToggle}
        tabIndex={onToggle ? undefined : -1}
        type="checkbox"
      />
      <Check
        aria-hidden="true"
        className={`pointer-events-none relative size-2.5 text-primary-content transition-none ${checked ? "opacity-100" : "opacity-0"}`}
        strokeWidth={2.5}
      />
    </span>
  );
}

export function CellDisplay({
  property,
  value,
  compact,
  onToggleCheckbox,
  resolvedDisplayAs,
  resolvedWrapContent,
  workspaceId,
}: CellDisplayProps) {
  const v = value as Record<string, unknown> | null;
  const displayAs = resolvedDisplayAs ?? property.config?.displayAs;
  const wrapContent = resolvedWrapContent ?? property.config?.wrapContent;
  const { data: session } = useSession();
  const [hoveredUser, setHoveredUser] = useState<{
    userId: string;
    rect: DOMRect;
  } | null>(null);
  const [voterTooltip, setVoterTooltip] = useState<{
    label: string;
    rect: DOMRect;
  } | null>(null);
  const [lightboxFile, setLightboxFile] = useState<FileItem | null>(null);
  // Explicit label association: the control lives inside CheckboxGlyph, so the
  // nesting alone is invisible to tooling. useId keeps it unique per instance —
  // a property-derived id would collide across cards in gallery/calendar grids.
  const checkboxId = useId();

  // Hover cards are fixed-position portals anchored to a snapshotted rect, so scrolling detaches
  // them without firing onMouseLeave — dismiss on scroll instead (capture-phase, only while open).
  useEffect(() => {
    if (!(hoveredUser || voterTooltip)) {
      return;
    }
    function dismiss() {
      setHoveredUser(null);
      setVoterTooltip(null);
    }
    document.addEventListener("scroll", dismiss, true);
    return () => document.removeEventListener("scroll", dismiss, true);
  }, [hoveredUser, voterTooltip]);

  switch (property.type) {
    case "text": {
      const text = (v as { text?: string } | null)?.text ?? "";
      if (!text) {
        return null;
      }
      return (
        <span className="block min-w-0 truncate text-xs text-base-content">
          {text}
        </span>
      );
    }

    case "number": {
      const n = (v as { number?: number | null } | null)?.number ?? null;
      return (
        <span className="truncate text-xs tabular-nums text-base-content">
          {formatNumber(
            n,
            (property.config?.format as NumberFormat) ?? "number"
          )}
        </span>
      );
    }

    case "select":
    case "status": {
      const optionId =
        (v as { optionId?: string | null } | null)?.optionId ?? null;
      if (displayAs === "checkbox") {
        const icon = (
          <CheckboxGlyph
            checked={!!optionId}
            id={checkboxId}
            onToggle={onToggleCheckbox}
          />
        );
        if (onToggleCheckbox) {
          return (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-base-content hover:text-base-content"
              htmlFor={checkboxId}
            >
              {icon}
              {property.name}
            </label>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-base-content">
            {icon}
            {property.name}
          </span>
        );
      }
      if (!optionId) {
        return null;
      }
      const options = (property.config?.options ?? []) as SelectOption[];
      const opt = options.find((o) => o.id === optionId);
      if (!opt) {
        return null;
      }
      const wrapCls = wrapContent
        ? "whitespace-normal wrap-break-word"
        : "truncate";
      const color = getOptionColor(opt.color);
      return (
        <span
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-xs px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: color.bg, color: color.text }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color.dot }}
          />
          <span className={wrapCls}>{opt.name}</span>
        </span>
      );
    }

    case "multi_select": {
      const optionIds = (v as { optionIds?: string[] } | null)?.optionIds ?? [];
      const options = (property.config?.options ?? []) as SelectOption[];
      const selected = optionIds
        .map((id) => options.find((o) => o.id === id))
        .filter(Boolean) as SelectOption[];
      if (displayAs === "checkbox") {
        const icon = (
          <CheckboxGlyph
            checked={selected.length > 0}
            id={checkboxId}
            onToggle={onToggleCheckbox}
          />
        );
        if (onToggleCheckbox) {
          return (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-base-content hover:text-base-content"
              htmlFor={checkboxId}
            >
              {icon}
              {property.name}
            </label>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-base-content">
            {icon}
            {property.name}
          </span>
        );
      }
      if (!selected.length) {
        return null;
      }
      const shown = compact ? selected.slice(0, 2) : selected;
      return (
        <div className="flex flex-wrap gap-1">
          {shown.map((opt) => {
            const color = getOptionColor(opt.color);
            return (
              <span
                className="inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-xs font-medium"
                key={opt.id}
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color.dot }}
                />
                {opt.name}
              </span>
            );
          })}
          {compact && selected.length > 2 && (
            <span className="text-xs text-base-content/70">
              +{selected.length - 2}
            </span>
          )}
        </div>
      );
    }

    case "date": {
      if (!(v as { date?: string | null } | null)?.date) {
        return null;
      }
      return (
        <span className="block min-w-0 truncate text-xs text-base-content">
          {formatDateValue(v)}
        </span>
      );
    }

    case "checkbox": {
      const checked = (v as { checked?: boolean } | null)?.checked ?? false;
      return (
        <span className="flex items-center">
          <CheckboxGlyph checked={checked} />
        </span>
      );
    }

    case "url": {
      const url = (v as { url?: string } | null)?.url ?? "";
      if (!url) {
        return null;
      }
      return (
        <a
          className="truncate text-xs text-primary hover:underline"
          href={url.startsWith("http") ? url : `https://${url}`}
          onClick={(e) => e.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          {url.replace(/^https?:\/\//, "")}
        </a>
      );
    }

    case "email": {
      const email = (v as { email?: string } | null)?.email ?? "";
      if (!email) {
        return null;
      }
      return (
        <a
          className="truncate text-xs text-primary hover:underline"
          href={`mailto:${email}`}
          onClick={(e) => e.stopPropagation()}
        >
          {email}
        </a>
      );
    }

    case "phone": {
      const phone = (v as { phone?: string } | null)?.phone ?? "";
      if (!phone) {
        return null;
      }
      return (
        <a
          className="text-xs text-base-content"
          href={`tel:${phone}`}
          onClick={(e) => e.stopPropagation()}
        >
          {phone}
        </a>
      );
    }

    // "created_by" is computed server-side from the entry's own createdBy
    // column (see app/api/databases/[id]/entries/route.ts) into the exact
    // same { userIds, _members } shape "person" values are saved with, so it
    // can share this rendering — it's just always a single, read-only user.
    case "person":
    case "created_by": {
      const userIds = (v as { userIds?: string[] } | null)?.userIds ?? [];
      const cachedMembers =
        (
          v as {
            _members?: { id: string; name: string; email: string }[];
          } | null
        )?._members ?? [];

      // Vote-mode: thumbs-up + count (always userIds.length) instead of the avatar list. No
      // onClick here — toggling is handled by each view's own cell-activation logic.
      if (property.type === "person" && property.config?.voteMode) {
        const hasVoted =
          !!session?.user?.id && userIds.includes(session.user.id);
        // Voter names come from the value's own `_members` cache (no extra fetch), reusing the
        // comment-reaction name formatter so "who voted" reads consistently everywhere.
        const nameById = Object.fromEntries(
          cachedMembers.map((m) => [m.id, m.name || m.email])
        );
        const voterLabel = userIds.length
          ? formatReactorNames(
              userIds,
              Object.fromEntries(
                userIds.map((id) => [
                  id,
                  id === session?.user?.id
                    ? "You"
                    : nameById[id] || "Former Member",
                ])
              )
            )
          : "";
        return (
          <>
            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: read-only vote tally, not a control — the only handlers reveal/hide a hover list of voter names. KNOWN A11Y DEBT: that list is not reachable by keyboard or screen reader. The fix belongs in useHoverTooltip (focus/blur + aria-describedby); putting tabIndex on every tally in a data table would add one dead tab stop per row. */}
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors duration-150 ${
                hasVoted
                  ? "bg-primary/10 text-primary"
                  : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
              }`}
              onMouseEnter={
                userIds.length
                  ? (e) =>
                      setVoterTooltip({
                        label: voterLabel,
                        rect: e.currentTarget.getBoundingClientRect(),
                      })
                  : undefined
              }
              onMouseLeave={
                userIds.length ? () => setVoterTooltip(null) : undefined
              }
            >
              <ThumbsUp fill={hasVoted ? "currentColor" : "none"} size={12} />
              {userIds.length}
            </span>
            {voterTooltip &&
              typeof document !== "undefined" &&
              createPortal(
                <IconTooltip
                  label={voterTooltip.label}
                  rect={voterTooltip.rect}
                />,
                document.body
              )}
          </>
        );
      }

      if (!userIds.length) {
        return null;
      }
      const shown = userIds.slice(0, compact ? 2 : 3);
      return (
        <div className="flex flex-wrap items-center gap-1">
          {shown.map((id) => {
            const member = cachedMembers.find((m) => m.id === id);
            // `||`, not `??` — a cached member with a genuinely empty-string
            // name/email (old data saved before that was fixed) would leak
            // through as a blank label/initial otherwise.
            const label = member?.name || member?.email || id;
            const initial = label.slice(0, 1).toUpperCase();
            return (
              // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: read-only person chip, not a control — the only handlers open/close a hover card. The person's name is already this chip's text content, so assistive tech gets the identity; only the supplementary card (email/avatar) is mouse-only. KNOWN A11Y DEBT tracked with the other useHoverTooltip sites; adding tabIndex per chip would put several dead tab stops in every table row.
              <span
                className="inline-flex items-center gap-1 rounded-xs bg-base-200 pl-0.5 pr-2 py-0.5"
                key={id}
                onMouseEnter={
                  workspaceId
                    ? (e) =>
                        setHoveredUser({
                          userId: id,
                          rect: e.currentTarget.getBoundingClientRect(),
                        })
                    : undefined
                }
                onMouseLeave={
                  workspaceId
                    ? () =>
                        setHoveredUser((cur) =>
                          cur?.userId === id ? null : cur
                        )
                    : undefined
                }
              >
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
                  {initial}
                </span>
                <span className="max-w-20 truncate text-xs font-medium text-base-content">
                  {label}
                </span>
                {workspaceId && hoveredUser?.userId === id && (
                  <UserHoverCard
                    cachedEmail={member?.email}
                    cachedName={member?.name}
                    currentUserId={session?.user?.id}
                    rect={hoveredUser.rect}
                    userId={id}
                    workspaceId={workspaceId}
                  />
                )}
              </span>
            );
          })}
          {userIds.length > (compact ? 2 : 3) && (
            <span className="text-xs text-base-content/70">
              +{userIds.length - (compact ? 2 : 3)}
            </span>
          )}
        </div>
      );
    }

    case "relation": {
      const entryIds = (v as { entryIds?: string[] } | null)?.entryIds ?? [];
      if (!entryIds.length) {
        return null;
      }
      return (
        <span className="text-xs text-base-content/70">
          {entryIds.length} {entryIds.length === 1 ? "entry" : "entries"}
        </span>
      );
    }

    case "files": {
      const files = (v as { files?: FileItem[] } | null)?.files ?? [];
      if (!files.length) {
        return null;
      }
      const shown = compact ? files.slice(0, 4) : files;
      return (
        <div
          className={`flex items-center gap-1.5 py-1 ${compact ? "flex-nowrap overflow-hidden" : "flex-wrap"}`}
        >
          {shown.map((f) => {
            const isImage = f.mimeType.startsWith("image/");
            return isImage ? (
              <button
                aria-label={`Preview ${f.name}`}
                className="shrink-0 cursor-zoom-in"
                key={f.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxFile(f);
                }}
                type="button"
              >
                {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
                <img
                  alt={f.name}
                  className="h-12 w-19 rounded-sm border border-base-300 object-cover"
                  src={f.url}
                />
              </button>
            ) : (
              <span
                className="flex h-12 w-19 shrink-0 flex-col items-center justify-center gap-1 rounded-sm border border-base-300 bg-base-200/30 px-1"
                key={f.id}
                title={f.name}
              >
                <FileIcon className="shrink-0 text-base-content/70" size={16} />
                <span className="w-full truncate text-center text-2xs text-base-content/70">
                  {f.name}
                </span>
              </span>
            );
          })}
          {compact && files.length > 4 && (
            <span className="text-xs text-base-content/70">
              +{files.length - 4}
            </span>
          )}
          {lightboxFile && (
            <ImageLightbox
              alt={lightboxFile.name}
              onClose={() => setLightboxFile(null)}
              src={lightboxFile.url}
            />
          )}
        </div>
      );
    }

    // Computed server-side (app/api/databases/[id]/entries/route.ts and
    // lib/formula/) — read-only, pre-formatted text, never edited from here.
    case "rollup":
    case "formula": {
      const display =
        (v as { display?: string | null } | null)?.display ?? null;
      if (!display) {
        return null;
      }
      return (
        <span className="truncate text-xs text-base-content/70">{display}</span>
      );
    }

    default:
      return null;
  }
}
