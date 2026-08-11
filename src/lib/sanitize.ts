/**
 * Server-side HTML sanitization utility.
 *
 * Uses DOMPurify with jsdom to strip XSS payloads from rich text input
 * (task descriptions, communication logs, contract notes, etc.).
 *
 * For plain text fields (names, titles, etc.), use sanitizePlainText() instead.
 */

import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize HTML content from rich text inputs.
 *
 * Allows safe inline formatting tags (bold, italic, links, lists) but
 * strips <script>, on* event handlers, javascript: URIs, and iframes.
 *
 * @example
 * const clean = sanitizeHtml(userInput); // "<b>Hello</b><script>alert(1)</script>" → "<b>Hello</b>"
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
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
}

/**
 * Sanitize plain text — strips ALL HTML tags, only keeps text content.
 *
 * Use for: names, titles, labels, short text fields that should never contain HTML.
 *
 * @example
 * const clean = sanitizePlainText(userInput); // "<script>alert(1)</script>" → "alert(1)"
 */
export function sanitizePlainText(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],  // Strip all tags
    ALLOWED_ATTR: [],  // Strip all attributes
  }).trim();
}

/**
 * Sanitize and truncate text to a max length (for database column constraints).
 */
export function sanitizeTruncate(dirty: string, maxLength: number): string {
  const clean = sanitizePlainText(dirty);
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength);
}