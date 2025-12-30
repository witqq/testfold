/**
 * ANSI Code Utilities
 */

// Regex to match ANSI escape codes
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/**
 * Check if text contains ANSI codes
 */
export function hasAnsi(text: string): boolean {
  return ANSI_REGEX.test(text);
}
