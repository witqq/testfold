/**
 * File filter coverage.
 *
 * `--file` values are forwarded to Jest and Playwright as positional test-path
 * filters. Both frameworks combine positional filters as a union, so a filter
 * that matches nothing is silently ignored whenever another filter matches.
 * These helpers check each requested filter against the test files the
 * selected suites actually ran.
 */

import { isAbsolute, resolve } from 'node:path';

/** Normalize the `file` option into a list of non-empty filters. */
export function normalizeFileFilters(file?: string | string[]): string[] {
  if (file === undefined) return [];
  const values = Array.isArray(file) ? file : [file];
  return values.filter((value) => value.trim() !== '');
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Check whether a requested filter selects a test file.
 *
 * Jest and Playwright treat a positional filter as a regular expression that is
 * searched in the absolute test-file path; Playwright also accepts a
 * `:line[:column]` suffix. Literal path comparisons are applied as well, so a
 * filter that is not a valid regular expression, or a test file reported
 * relative to a framework root, is still recognized.
 */
export function matchesFileFilter(filter: string, testFile: string, cwd: string): boolean {
  const pattern = filter.replace(/:\d+(?::\d+)?$/, '');
  const absoluteFile = isAbsolute(testFile) ? testFile : resolve(cwd, testFile);
  const candidates = [
    ...new Set([testFile, absoluteFile, toPosix(testFile), toPosix(absoluteFile)]),
  ];
  const posixPattern = toPosix(pattern);

  let regex: RegExp | null = null;
  try {
    regex = new RegExp(pattern);
  } catch {
    regex = null;
  }

  if (regex && candidates.some((candidate) => regex.test(candidate))) {
    return true;
  }

  if (
    candidates.some((candidate) => candidate.includes(posixPattern) || candidate.includes(pattern))
  ) {
    return true;
  }

  if (toPosix(resolve(cwd, pattern)) === toPosix(absoluteFile)) {
    return true;
  }

  // Test file reported relative to a framework root that is unknown here.
  return !isAbsolute(testFile) && posixPattern.endsWith(`/${toPosix(testFile)}`);
}

/**
 * Return the filters that match no test file in any of the given inventories.
 * Returns `null` when at least one inventory is unknown, because an unmatched
 * filter could then belong to the suite whose files are not known.
 */
export function findUnmatchedFileFilters(
  filters: string[],
  inventories: Array<readonly string[] | undefined>,
  cwd: string,
): string[] | null {
  if (filters.length === 0) return [];
  if (inventories.some((inventory) => inventory === undefined)) return null;

  const files = inventories.flatMap((inventory) => inventory ?? []);
  return filters.filter((filter) => !files.some((file) => matchesFileFilter(filter, file, cwd)));
}
