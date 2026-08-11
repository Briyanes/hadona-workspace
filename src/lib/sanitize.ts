/**
 * Server-side HTML sanitization utility.
 *
 * NOTE: We intentionally avoid top-level import of isomorphic-dompurify
 * because it can crash Vercel serverless cold starts (jsdom dependency).
 * Instead, we use:
 *  - Regex-based stripping for plain text (no dependency, always works)
 *  - Dynamic import of dompurify for rich HTML (only when actually needed)
 */

/**
 * Sanitize plain text — strips ALL HTML tags, only keeps text content.
 *
 * Use for: names, titles, labels, short text fields, chat messages.
 * No external dependency — pure regex, safe for serverless cold start.
 *
 * @example
 * const clean = sanitizePlainText(userInput); // "<script>alert(1)</script>" → "alert(1)"
 */
export function sanitizePlainText(dirty: string): string {
  if (!dirty) return "";
  return dirty
    .replace(/<[^>]*>/g, "")   // Strip all HTML tags
    .replace(/</g, "<")      // Decode common entities
    .replace(/>/g, ">")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // Strip control chars
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
 * Sanitize HTML content from rich text inputs.
 *
 * Allows safe inline formatting tags (bold, italic, links, lists) but
 * strips <script>, on* event handlers, javascript: URIs, and iframes.
 *
 * Uses dynamic import so serverless cold start isn't blocked by jsdom.
 *
 * @example
 * const clean = await sanitizeHtml(userInput);
 */
export async function sanitizeHtml(dirty: string): Promise<string> {
  if (!dirty) return "";
  try {
    const DOMPurify = (await import("isomorphic-dompurify")).default;
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [
        "b", "i", "em", "strong", "u", "s", "del", "ins", "mark",
        "a", "p", "br", "hr",
        "ul", "ol", "li",
        "blockquote", "code", "pre",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "span", "div",
        "table", "thead", "tbody", "tr", "th", "td",
      ],
      ALLOWED_ATTR: ["href", "title", "target", "rel", "class", "colspan", "rowspan"],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "textarea"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
    });
  } catch {
    // If dompurify fails to load, fall back to plain text stripping
    return sanitizePlainText(dirty);
  }
}