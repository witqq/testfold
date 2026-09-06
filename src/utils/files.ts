/**
 * File Utilities
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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
export async function writeFileWithDir(path: string, content: string): Promise<void> {
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
    await rm(resultPath, { force: true });

    // Delete log file
    const logPath = join(artifactsDir, suite.logFile);
    await rm(logPath, { force: true });

    // Delete failures directory for this suite
    // Use same sanitization as markdown.ts for consistency
    const sanitizedName = suite.name.toLowerCase().replace(/\s+/g, '-');
    const failuresDir = join(artifactsDir, 'failures', sanitizedName);
    if (existsSync(failuresDir)) {
      await rm(failuresDir, { recursive: true, force: true });
    }
  }
}

export interface ArtifactsLockOptions {
  pollIntervalMs?: number;
}

/**
 * Serialize independent Testfold processes that target the same artifacts directory.
 * A whole-run lock is required: locking cleanup alone still lets two runners overwrite
 * each other's JSON/log files before either parser reads them.
 */
export async function acquireArtifactsLock(
  artifactsDir: string,
  options: ArtifactsLockOptions = {},
): Promise<() => Promise<void>> {
  await ensureDir(dirname(artifactsDir));
  const lockDir = join(dirname(artifactsDir), `.${basename(artifactsDir)}.testfold-lock`);
  const ownerPath = join(lockDir, 'owner.json');
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new Error('Artifact lock poll interval must be a positive integer');
  }

  while (true) {
    const owner = { pid: process.pid, nonce: randomUUID() };
    try {
      await mkdir(lockDir);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      if (await lockOwnerIsGone(lockDir, ownerPath)) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
      continue;
    }
    try {
      await writeFile(ownerPath, JSON.stringify(owner));
    } catch (error) {
      await rm(lockDir, { recursive: true, force: true });
      throw error;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      if (await lockIsOwnedBy(ownerPath, owner)) {
        await rm(lockDir, { recursive: true, force: true });
      }
    };
  }
}

async function lockIsOwnedBy(
  ownerPath: string,
  owner: { pid: number; nonce: string },
): Promise<boolean> {
  try {
    return (await readFile(ownerPath, 'utf8')) === JSON.stringify(owner);
  } catch {
    return false;
  }
}

async function lockOwnerIsGone(lockDir: string, ownerPath: string): Promise<boolean> {
  try {
    const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as { pid?: unknown };
    if (!Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) return true;
    try {
      process.kill(Number(owner.pid), 0);
      return false;
    } catch (error) {
      return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ESRCH'
      );
    }
  } catch {
    try {
      return Date.now() - (await stat(lockDir)).mtimeMs > 5_000;
    } catch {
      return false;
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  );
}
