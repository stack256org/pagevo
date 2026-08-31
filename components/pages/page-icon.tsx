"use client";

import {
  Activity,
  AlertCircle,
  Archive,
  Award,
  BarChart2,
  Bell,
  Bookmark,
  BookOpen,
  Briefcase,
  Building,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  Clipboard,
  Clock,
  Code,
  Coffee,
  Compass,
  Database,
  Download,
  Edit,
  Eye,
  FilePlus,
  FileText,
  Flag,
  Flame,
  Folder,
  FolderOpen,
  Gem,
  Gift,
  Globe,
  Grid2X2,
  Hash,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Image,
  Info,
  Key,
  Layers,
  Lightbulb,
  Link,
  List,
  Lock,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  MessageSquare,
  Mic,
  Monitor,
  Music,
  Package,
  Paperclip,
  Pen,
  Pencil,
  Phone,
  PieChart,
  Rocket,
  Search,
  Send,
  Settings,
  Share,
  Shield,
  ShoppingCart,
  Star,
  Tag,
  Target,
  Terminal,
  TrendingUp,
  Truck,
  Upload,
  User,
  Users,
  Video,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { flagIconCode } from "@/lib/emoji-flags";

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  FileText,
  Folder,
  FolderOpen,
  Star,
  Heart,
  Bookmark,
  Flag,
  Bell,
  Calendar,
  Clock,
  Search,
  Mail,
  MessageSquare,
  User,
  Users,
  Settings,
  Link,
  Globe,
  Database,
  Terminal,
  Code,
  BarChart2,
  PieChart,
  TrendingUp,
  Activity,
  Home,
  Building,
  Briefcase,
  Rocket,
  Zap,
  Flame,
  Target,
  Pencil,
  Pen,
  Edit,
  Check,
  Clipboard,
  Download,
  Upload,
  Share,
  Map: MapIcon,
  Phone,
  Lock,
  Key,
  Shield,
  ShoppingCart,
  Package,
  Coffee,
  Gift,
  Gem,
  Camera,
  Image,
  Video,
  Music,
  BookOpen,
  Archive,
  Tag,
  List,
  Hash,
  Layers,
  Wrench,
  Compass,
  Lightbulb,
  FilePlus,
  Grid2X2,
  Award,
  Headphones,
  Mic,
  Monitor,
  Paperclip,
  Send,
  Truck,
  Wifi,
  ChevronRight,
  Eye,
  AlertCircle,
  Info,
  HelpCircle,
};

type ParsedIcon =
  | { kind: "emoji"; value: string }
  | { kind: "icon"; name: string; color: string }
  | { kind: "image"; url: string };

export function parseIcon(raw: string | null | undefined): ParsedIcon | null {
  if (!raw) {
    return null;
  }
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw) as {
        type?: string;
        name?: string;
        color?: string;
        url?: string;
      };
      if (obj.type === "icon" && obj.name) {
        return { kind: "icon", name: obj.name, color: obj.color ?? "#6b7280" };
      }
      if (obj.type === "image" && obj.url) {
        return { kind: "image", url: obj.url };
      }
    } catch {
      // fall through to emoji
    }
  }
  return { kind: "emoji", value: raw };
}

interface PageIconProps {
  className?: string;
  icon: string | null | undefined;
  size?: number;
}

export function PageIcon({ icon, size = 16, className = "" }: PageIconProps) {
  const parsed = parseIcon(icon);
  if (!parsed) {
    return null;
  }

  if (parsed.kind === "emoji") {
    // Country/region flag emoji don't render on Windows (the system font shows
    // the raw "TM"-style letter pair). Draw them with the flag-icons SVG set —
    // the same one the emoji picker grid uses — so flags display everywhere.
    const flagCode = flagIconCode(parsed.value);
    if (flagCode) {
      return (
        <span
          aria-hidden
          className={`fi fi-${flagCode} fis shrink-0 rounded-[2px] ${className}`}
          style={{ fontSize: size, lineHeight: 1 }}
        />
      );
    }
    return (
      <span
        className={`leading-none select-none ${className}`}
        style={{ fontSize: size, lineHeight: 1 }}
      >
        {parsed.value}
      </span>
    );
  }

  if (parsed.kind === "icon") {
    const Comp = ICON_REGISTRY[parsed.name];
    if (!Comp) {
      return null;
    }
    return (
      <Comp
        className={`shrink-0 ${className}`}
        color={parsed.color}
        size={size}
        strokeWidth={1.75}
      />
    );
  }

  if (parsed.kind === "image") {
    const radius = size >= 40 ? 6 : size >= 20 ? 4 : 2;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      // biome-ignore lint/performance/noImgElement: src is an arbitrary third-party/user-supplied URL; next/image would need a wildcard remotePatterns entry
      <img
        alt=""
        className={`shrink-0 object-cover ${className}`}
        src={parsed.url}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return null;
}
