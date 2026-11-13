import { ArrowUpRight, EllipsisVertical, FileText, History, Plus, Search, SlidersHorizontal, Star, Trash2, Upload, X, type LucideIcon } from "lucide-react";

/** The Documents page's icons, from the same Lucide set as the rest of the app (see DashboardIcon). */
const icons = {
  search: Search,
  plus: Plus,
  filters: SlidersHorizontal,
  file: FileText,
  upload: Upload,
  more: EllipsisVertical,
  star: Star,
  close: X,
  history: History,
  arrow: ArrowUpRight,
  trash: Trash2,
} satisfies Record<string, LucideIcon>;

export function DocumentIcon({
  name,
  size = 20,
  filled = false,
}: {
  name: keyof typeof icons;
  size?: number;
  filled?: boolean;
}) {
  const Glyph = icons[name];
  return <Glyph size={size} strokeWidth={2} fill={filled ? "currentColor" : "none"} aria-hidden="true" focusable="false" />;
}
