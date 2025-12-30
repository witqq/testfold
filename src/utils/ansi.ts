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
  // Use fresh regex to avoid global regex lastIndex state bug
  return /\x1b\[[0-9;]*m/.test(text);
}
