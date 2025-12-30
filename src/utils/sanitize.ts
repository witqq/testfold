/**
 * Filename Sanitization Utilities
 */

/**
 * Sanitize a string for use as a filename
 * - Removes special characters
 * - Replaces spaces with hyphens
 * - Lowercases
 * - Truncates to max length
 */
export function sanitizeFilename(name: string, maxLength = 100): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Multiple hyphens to single
    .replace(/^-|-$/g, '') // Trim hyphens from start/end
    .slice(0, maxLength);
}
