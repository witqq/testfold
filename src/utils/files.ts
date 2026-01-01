/**
 * File Utilities
 */

import { mkdir, rm, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Ensure directory exists
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Clean and recreate directory
 */
export async function cleanDir(path: string): Promise<void> {
  if (existsSync(path)) {
    await rm(path, { recursive: true, force: true });
  }
  await mkdir(path, { recursive: true });
}

/**
 * Write file with parent directory creation
 */
export async function writeFileWithDir(
  path: string,
  content: string,
): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content);
}

/**
 * Artifact paths for a suite
 */
export interface SuiteArtifacts {
  /** Suite name for failure directory */
  name: string;
  /** Result JSON file path */
  resultFile: string;
  /** Log file path */
  logFile: string;
}

/**
 * Clean only artifacts for specific suites
 * Preserves artifacts from other suites
 */
export async function cleanSuiteArtifacts(
  artifactsDir: string,
  suites: SuiteArtifacts[],
): Promise<void> {
  // Ensure directory exists
  await ensureDir(artifactsDir);

  for (const suite of suites) {
    // Delete result file
    const resultPath = join(artifactsDir, suite.resultFile);
    if (existsSync(resultPath)) {
      await unlink(resultPath);
    }

    // Delete log file
    const logPath = join(artifactsDir, suite.logFile);
    if (existsSync(logPath)) {
      await unlink(logPath);
    }

    // Delete failures directory for this suite
    // Use same sanitization as markdown.ts for consistency
    const sanitizedName = suite.name.toLowerCase().replace(/\s+/g, '-');
    const failuresDir = join(artifactsDir, 'failures', sanitizedName);
    if (existsSync(failuresDir)) {
      await rm(failuresDir, { recursive: true, force: true });
    }
  }
}
