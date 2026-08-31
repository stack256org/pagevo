import {
  BarChart2,
  Book,
  Briefcase,
  Calendar,
  CheckSquare,
  Code2,
  Compass,
  DollarSign,
  FileText,
  FolderOpen,
  Heart,
  Home,
  LayoutGrid,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  Palette,
  Rocket,
  Settings,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

// The icons an admin can pick for a template category. Kept in one place so
// the picker in the admin UI and every consumer that renders a category
// resolve from the exact same set — a name stored by the picker that the
// renderer didn't know about would silently fall back to the default.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  BarChart2,
  Book,
  Briefcase,
  Calendar,
  CheckSquare,
  Code2,
  Compass,
  DollarSign,
  FileText,
  FolderOpen,
  Heart,
  Home,
  LayoutGrid,
  Lightbulb,
  Megaphone,
  Palette,
  Rocket,
  Settings,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Users,
  Zap,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

export const DEFAULT_CATEGORY_ICON = "LayoutGrid";

// Categories created before the `icon` column existed have none stored, so
// they keep the old behaviour: an icon cycled from a small palette by
// position. New categories use whatever the admin actually picked.
const LEGACY_CYCLE: LucideIcon[] = [
  Zap,
  BarChart2,
  Megaphone,
  Code2,
  DollarSign,
  Tag,
];

export function resolveCategoryIcon(
  icon: string | null | undefined,
  positionalIndex = -1
): LucideIcon {
  if (icon && CATEGORY_ICONS[icon]) {
    return CATEGORY_ICONS[icon];
  }
  if (positionalIndex >= 0) {
    return LEGACY_CYCLE[positionalIndex % LEGACY_CYCLE.length] ?? LayoutGrid;
  }
  return LayoutGrid;
}
