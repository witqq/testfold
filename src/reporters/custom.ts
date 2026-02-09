/**
 * Custom Reporter Loader
 *
 * Dynamically loads user-specified reporter modules using ESM import.
 * Follows the same pattern as custom parser loading.
 */

import { resolve, isAbsolute } from 'node:path';
import type { Reporter } from './types.js';

/**
 * Validates that an object implements the Reporter interface
 */
function isReporter(obj: unknown): obj is Reporter {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'onStart' in obj &&
    typeof (obj as Reporter).onStart === 'function' &&
    'onSuiteComplete' in obj &&
    typeof (obj as Reporter).onSuiteComplete === 'function' &&
    'onComplete' in obj &&
    typeof (obj as Reporter).onComplete === 'function'
  );
}

/**
 * Load a custom reporter from a file path
 */
export async function loadCustomReporter(
  reporterPath: string,
  cwd: string,
  ...constructorArgs: unknown[]
): Promise<Reporter> {
  const absolutePath = isAbsolute(reporterPath)
    ? reporterPath
    : resolve(cwd, reporterPath);

  const fileUrl = `file://${absolutePath}`;

  let module: unknown;
  try {
    module = await import(fileUrl);
  } catch (error) {
    throw new Error(
      `Failed to load custom reporter from ${reporterPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const moduleObj = module as Record<string, unknown>;

  // Check for default export
  if (moduleObj.default) {
    const defaultExport = moduleObj.default;

    // If default is a class, instantiate it
    if (typeof defaultExport === 'function') {
      try {
        const instance = new (defaultExport as new (...args: unknown[]) => Reporter)(
          ...constructorArgs,
        );
        if (isReporter(instance)) {
          return instance;
        }
      } catch {
        // Not a constructor, try as object
      }
    }

    // If default is already an object with reporter methods
    if (isReporter(defaultExport)) {
      return defaultExport;
    }
  }

  // Check for named 'reporter' export
  if (moduleObj.reporter && isReporter(moduleObj.reporter)) {
    return moduleObj.reporter as Reporter;
  }

  // Check if module itself is a reporter
  if (isReporter(moduleObj)) {
    return moduleObj;
  }

  throw new Error(
    `Custom reporter at ${reporterPath} does not export a valid Reporter interface. ` +
      `Export must implement onStart(), onSuiteComplete(), and onComplete() methods.`,
  );
}

/**
 * Check if a reporter name looks like a file path
 */
export function isReporterPath(name: string): boolean {
  return (
    name.startsWith('./') ||
    name.startsWith('../') ||
    name.startsWith('/') ||
    name.endsWith('.ts') ||
    name.endsWith('.js') ||
    name.endsWith('.mjs')
  );
}
