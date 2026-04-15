import { format } from "date-fns";

export type CategoryKey = "school" | "sport" | "work" | "health" | "family" | "personal" | "other";

export interface CalendarCategory {
  label: string;
  cssVar: string;
  icon: string;
}

export const CATEGORIES: Record<CategoryKey, CalendarCategory> = {
  school:   { label: "Scuola",    cssVar: "--cal-school",   icon: "🎓" },
  sport:    { label: "Sport",     cssVar: "--cal-sport",    icon: "⚽" },
  work:     { label: "Lavoro",    cssVar: "--cal-work",     icon: "💼" },
  health:   { label: "Salute",    cssVar: "--cal-health",   icon: "🏥" },
  family:   { label: "Famiglia",  cssVar: "--cal-family",   icon: "🏠" },
  personal: { label: "Personale", cssVar: "--cal-personal", icon: "⭐" },
  other:    { label: "Altro",     cssVar: "--cal-other",    icon: "📌" },
};

// Backward compatibility alias
export const CATS = CATEGORIES;

export const ALL_CATEGORIES = Object.keys(CATEGORIES) as CategoryKey[];

// Backward compatibility alias
export const ALL_CATS = ALL_CATEGORIES;

/**
 * Gets the icon for a calendar category.
 * @param category - The category key or any string value; defaults to "other" if invalid
 * @returns The emoji icon string for the category
 */
export function categoryIcon(category?: string | null): string {
  const key = (category && category in CATEGORIES) ? (category as CategoryKey) : "other";
  return CATEGORIES[key].icon;
}

// Backward compatibility alias
export const catIcon = categoryIcon;

/**
 * Gets the CSS color variable for a calendar category.
 * @param category - The category key or any string value; defaults to "other" if invalid
 * @returns A CSS variable reference string (e.g., "var(--cal-school)")
 */
export function categoryColor(category?: string | null): string {
  const key = (category && category in CATEGORIES) ? (category as CategoryKey) : "other";
  return `var(${CATEGORIES[key].cssVar})`;
}

// Backward compatibility alias
export const catColor = categoryColor;

/**
 * Formats a time range in HH:mm format.
 * @param start - Start time
 * @param end - End time (optional); if not provided, returns only the start time
 * @returns Formatted duration string (e.g., "09:00 – 10:30" or "09:00")
 */
export function formatDuration(start: Date, end: Date | null | undefined): string {
  if (!end) return format(start, "HH:mm");
  return `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
}

// Backward compatibility alias
export const fmtDurata = formatDuration;

/**
 * Formats a date as a time in HH:mm format.
 * @param date - The date to format
 * @returns Formatted time string (e.g., "14:30")
 */
export function formatTime(date: Date): string {
  return format(date, "HH:mm");
}

// Backward compatibility alias
export const fmtOra = formatTime;
