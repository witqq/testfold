/**
 * Path Prefix Resolver
 * Resolves partial test file names to full paths using prefix matching
 */

import { readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

export interface PathResolverOptions {
  /** Base directory to search in */
  baseDir: string;
  /** File extensions to match (default: ['.test.ts', '.test.js', '.spec.ts', '.spec.js']) */
  extensions?: string[];
}

const DEFAULT_EXTENSIONS = ['.test.ts', '.test.js', '.spec.ts', '.spec.js'];

/**
 * Resolve a partial file name to full path(s) using prefix matching
 *
 * @param prefix - Partial file name to match (e.g., "auth", "user-service")
 * @param options - Resolver options
 * @returns Array of matching file paths relative to baseDir
 */
export function resolvePathPrefix(
  prefix: string,
  options: PathResolverOptions,
): string[] {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const matches: string[] = [];

  // Recursively find all test files
  const testFiles = findTestFiles(options.baseDir, extensions);

  // Filter by prefix match
  for (const file of testFiles) {
    const fileName = basename(file);
    const fileNameWithoutExt = removeTestExtension(fileName, extensions);

    // Match if file name starts with prefix (case-insensitive)
    if (fileNameWithoutExt.toLowerCase().startsWith(prefix.toLowerCase())) {
      matches.push(file);
    }
  }

  return matches;
}

/**
 * Find all test files in directory recursively
 */
function findTestFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.startsWith('.') && entry !== 'node_modules') {
            files.push(...findTestFiles(fullPath, extensions));
          }
        } else if (stat.isFile()) {
          // Check if file has test extension
          if (isTestFile(entry, extensions)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Check if file name matches test file pattern
 */
function isTestFile(fileName: string, extensions: string[]): boolean {
  return extensions.some(ext => fileName.endsWith(ext));
}

/**
 * Remove test extension from file name
 * "auth.test.ts" -> "auth"
 */
function removeTestExtension(fileName: string, extensions: string[]): string {
  for (const ext of extensions) {
    if (fileName.endsWith(ext)) {
      return fileName.slice(0, -ext.length);
    }
  }
  return fileName.replace(extname(fileName), '');
}

/**
 * Resolve multiple prefixes and return unique paths
 */
export function resolvePathPrefixes(
  prefixes: string[],
  options: PathResolverOptions,
): string[] {
  const allMatches = new Set<string>();

  for (const prefix of prefixes) {
    const matches = resolvePathPrefix(prefix, options);
    for (const match of matches) {
      allMatches.add(match);
    }
  }

  return Array.from(allMatches);
}
