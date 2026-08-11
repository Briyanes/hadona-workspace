/**
 * Server-side text sanitization utility.
 *
 * Zero external dependencies — pure regex based.
 * Safe for Vercel serverless cold starts.
 */

/**
 * Sanitize plain text — strips ALL HTML tags, only keeps text content.
 *
 * Use for: names, titles, labels, short text fields, chat messages.
 *
 * @example
 * const clean = sanitizePlainText(userInput); // "<script>alert(1)</script>" → "alert(1)"
 */
export function sanitizePlainText(dirty: string): string {
  if (!dirty) return "";
  return dirty
    .replace(/<[^>]*>/g, "")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

/**
 * Sanitize and truncate text to a max length (for database column constraints).
 */
export function sanitizeTruncate(dirty: string, maxLength: number): string {
  const clean = sanitizePlainText(dirty);
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength);
}

/**
 * Sanitize HTML content — strips dangerous tags but keeps safe formatting.
 *
 * Uses regex-based approach (no external dependency, safe for serverless).
 *
 * @example
 * const clean = sanitizeHtml(userInput);
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  return dirty
    // Remove script/style/iframe/object/embed/form tags completely
    .replace(/<(script|style|iframe|object|embed|form|input|textarea)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|textarea)[^>]*\/?>/gi, "")
    // Remove event handlers (on*)
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    // Remove javascript: URIs
    .replace(/href\s*=\s*"\s*javascript:/gi, 'href="')
    .replace(/src\s*=\s*"\s*javascript:/gi, 'src="')
    // Remove data: URIs in src (potential XSS)
    .replace(/src\s*=\s*"\s*data:/gi, 'src="')
    // Strip control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}