import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  return words.length === 1
    ? words[0]!.charAt(0).toUpperCase()
    : (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase()
}

// Fixed hues (not theme tokens) so avatar identity colors stay stable across themes
// and keep white initials readable at >= 5:1 contrast in both light and dark.
const AVATAR_BG_CLASSES = [
  "bg-[#0369A1]", "bg-[#B91C1C]", "bg-[#047857]", "bg-[#B45309]",
  "bg-[#6D28D9]", "bg-[#0F766E]", "bg-[#BE185D]", "bg-[#4338CA]",
] as const

export function getAvatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_BG_CLASSES[h % AVATAR_BG_CLASSES.length]!
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Never"
  }
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
