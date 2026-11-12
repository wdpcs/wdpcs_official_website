'use strict';

// Allowlisted HTML tags for rich text CMS content (no scripts, iframes, objects, inline event handlers)
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'blockquote', 'a', 'span', 'hr'
]);

const SUBRULE_FORBIDDEN_RE = /\bsub[-\s]?rules?\b|സബ്[-\s]?റൂൾ|സാന്ത്വനം\s*നിയമാവലി/i;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizePlainText(val, maxLen = 4000) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function sanitizeSafeUrl(href) {
  const clean = String(href || '').trim();
  if (!clean) return '#';
  const lower = clean.toLowerCase().replace(/[\u0000-\u0020]+/g, '');
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return '#';
  }
  if (/^(https?:|mailto:|tel:|\/|\.\.?\/|#)/i.test(clean) || /^[a-z0-9._-]+\.html([#?].*)?$/i.test(clean) || /^assets\/[a-z0-9/._-]+$/i.test(clean)) {
    return escapeHtml(clean);
  }
  return '#';
}

/**
 * Sanitizes rich text produced by the built-in no-code WYSIWYG editor.
 * Strips dangerous tags (<script>, <style>, <iframe>, <svg>, <object>, etc.)
 * and all inline event handlers (on*) or javascript: URIs.
 */
function sanitizeRichHtml(input, maxLen = 25000) {
  if (input === null || input === undefined) return '';
  let html = String(input).slice(0, maxLen);

  // Drop entire dangerous element blocks
  html = html.replace(/<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|meta|link|base)[^>]*\/?>/gi, '');

  // Filter tags against strict allowlist
  html = html.replace(/<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>/g, (full, slash, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }
    if (slash) {
      return tag === 'br' || tag === 'hr' ? '' : `</${tag}>`;
    }
    if (tag === 'br' || tag === 'hr') {
      return `<${tag}>`;
    }
    if (tag === 'a') {
      const hrefMatch = rawAttrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = sanitizeSafeUrl(hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '') : '#');
      const targetExternal = /^https?:\/\//i.test(href);
      return targetExternal
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">`
        : `<a href="${href}">`;
    }
    return `<${tag}>`;
  });

  return html.trim();
}

function containsSanthwanamSubruleViolation(textOrObj) {
  const hay = typeof textOrObj === 'string' ? textOrObj : JSON.stringify(textOrObj || '');
  return SUBRULE_FORBIDDEN_RE.test(hay);
}

function sanitizeSafeCsvCell(val) {
  const str = String(val ?? '');
  const trimmed = str.replace(/\r?\n/g, ' ');
  // Neutralize CSV/Excel formula injection
  const safe = /^[=+\-@\t\r]/.test(trimmed) ? `'${trimmed}` : trimmed;
  return `"${safe.replace(/"/g, '""')}"`;
}

module.exports = {
  escapeHtml,
  sanitizePlainText,
  sanitizeRichHtml,
  sanitizeSafeUrl,
  containsSanthwanamSubruleViolation,
  sanitizeSafeCsvCell
};

