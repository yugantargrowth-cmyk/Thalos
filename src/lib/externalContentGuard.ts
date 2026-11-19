/**
 * External Content Untrusted Guard (S03-AC-06)
 * ─────────────────────────────────────────────────────────────
 * Treats all externally ingested text (web pages, search snippets,
 * uploaded document text, external emails/webhooks) as UNTRUSTED.
 *
 * Prevents prompt injection, system instruction overrides, and
 * unauthorized tool execution via indirect injection attacks.
 */

// Patterns commonly used in prompt injection / instruction override attacks
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /you\s+are\s+now\s+(an\s+unrestricted|a\s+different|in\s+developer\s+mode)/i,
  /system\s*prompt\s*:/i,
  /assistant\s*instructions\s*:/i,
  /override\s+system\s+directives/i,
  /reveal\s+(all\s+)?(api\s+keys|credentials|passwords|secrets)/i,
];

/**
 * Detect if text contains common prompt injection attempts.
 */
export function isPotentialPromptInjection(text: string): boolean {
  if (!text) return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize external text by neutralizing dangerous control characters
 * and instructions while preserving informative content.
 */
export function sanitizeExternalText(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // Escape / neutralize XML and Markdown delimiters that attempt to close system context
  sanitized = sanitized
    .replace(/<\/system>/gi, '&lt;/system&gt;')
    .replace(/<system>/gi, '&lt;system&gt;')
    .replace(/<\/instructions>/gi, '&lt;/instructions&gt;')
    .replace(/<instructions>/gi, '&lt;instructions&gt;');

  // Neutralize direct prompt injection commands with inert annotations
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[NEUTRALIZED_UNTRUSTED_INSTRUCTION]');
  }

  return sanitized;
}

/**
 * Wrap external content in strict untrusted demarcation delimiters.
 * Ensures LLMs evaluate the content solely as inert data rather than executable instructions.
 */
export function wrapUntrustedContent(content: string, source: string): string {
  const sanitized = sanitizeExternalText(content);
  return `<<<BEGIN UNTRUSTED EXTERNAL CONTENT: ${source}>>>\n${sanitized}\n<<<END UNTRUSTED EXTERNAL CONTENT>>>`;
}
