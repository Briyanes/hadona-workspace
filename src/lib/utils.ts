import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely extract error message from any thrown value.
 * Handles Supabase errors (plain objects with .message), native Errors, and strings.
 */
export function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Format number to Indonesian Rupiah currency.
 */
export function formatIDR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format compact number (e.g. 1.2M, 3.5K).
 */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format date to Indonesian locale.
 */
export function formatDate(
  date: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(d);
}

/**
 * Calculate relative time (e.g. "2 hari lagi", "kemarin").
 */
export function timeUntil(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
  if (Math.abs(days) >= 1) return rtf.format(days, "day");
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (Math.abs(hours) >= 1) return rtf.format(hours, "hour");
  const minutes = Math.round(diff / (1000 * 60));
  return rtf.format(minutes, "minute");
}

/**
 * Get initials from a name (e.g. "Ovi Rismawanti" -> "OR").
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Parse a currency string like "Rp3.363.724" or "IDR351,911" to a number.
 */
export function parseIDR(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a percentage string like "2,27%" to a number (2.27).
 */
export function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace("%", "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}