/**
 * Command Executor - runs test commands
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Suite } from '../config/types.js';
import { resolvePathPrefix } from '../utils/path-resolver.js';

export interface ExecuteOptions {
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
  /** Grace period (ms) before SIGKILL after SIGTERM (default: 5000) */
  killGracePeriod?: number;
  logFile: string;
  /** Pass-through arguments appended to command */
  passThrough?: string[];
  /** Base directory for resolving path prefixes (defaults to cwd) */
  testsDir?: string;
  /** Grep pattern to filter tests by name */
  grep?: string;
  /** Grep-invert pattern to exclude tests by name */
  grepInvert?: string;
  /** Filter by test file path */
  file?: string;
  /** Callback for streaming stdout output chunks in real-time */
  onOutput?: (chunk: string) => void;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

const MAX_BUFFER = 50 * 1024 * 1024; // 50MB

/**
 * Resolve path prefixes in pass-through arguments
 * Arguments that look like test file prefixes are resolved to full paths
 */
function resolvePassThroughPaths(
  args: string[],
  testsDir: string,
): string[] {
  return args.map((arg) => {
    // Skip flags (starts with -)
    if (arg.startsWith('-')) {
      return arg;
    }

    // Skip if already looks like a full path (contains / or \)
    if (arg.includes('/') || arg.includes('\\')) {
      return arg;
    }

    // Skip if it's clearly not a file prefix (no letters, just numbers, etc.)
    if (!/[a-zA-Z]/.test(arg)) {
      return arg;
    }

    // Try to resolve as a path prefix
    const matches = resolvePathPrefix(arg, { baseDir: testsDir });

    // If exactly one match, use it; otherwise keep original
    if (matches.length === 1 && matches[0]) {
      return matches[0];
    }

    return arg;
  });
}

/**
 * Build framework-specific filter arguments from grep/grepInvert/file options
 */
export function buildFilterArgs(
  suiteType: Suite['type'],
  options: Pick<ExecuteOptions, 'grep' | 'grepInvert' | 'file'>,
): string[] {
  const args: string[] = [];

  if (options.grep) {
    if (suiteType === 'jest') {
      args.push(`--testNamePattern=${options.grep}`);
    } else if (suiteType === 'playwright') {
      args.push(`--grep=${options.grep}`);
    } else {
      // Custom: pass as-is
      args.push(`--grep=${options.grep}`);
    }
  }

  if (options.grepInvert) {
    if (suiteType === 'playwright') {
      args.push(`--grep-invert=${options.grepInvert}`);
    } else {
      // Jest and custom: pass as-is (Jest doesn't have native grep-invert)
      args.push(`--grep-invert=${options.grepInvert}`);
    }
  }

  if (options.file) {
    // File filter is appended directly — works for both Jest and Playwright
    args.push(options.file);
  }

  return args;
}

/**
 * Build workers flag for the framework
 */
export function buildWorkersArg(
  suiteType: Suite['type'],
  workers: number,
): string | null {
  if (suiteType === 'jest') {
    return `--maxWorkers=${workers}`;
  } else if (suiteType === 'playwright') {
    return `--workers=${workers}`;
  }
  return null;
}

export async function executeCommand(
  suite: Suite,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Build command with filter and pass-through arguments
    const commandParts = suite.command.split(' ');
    const filterArgs = buildFilterArgs(suite.type, options);
    const passThrough = options.passThrough ?? [];

    // Resolve path prefixes in pass-through arguments
    const testsDir = options.testsDir ?? options.cwd;
    const resolvedPassThrough = resolvePassThroughPaths(passThrough, testsDir);

    // Build workers flag if suite has workers config
    const workersArg = suite.workers
      ? buildWorkersArg(suite.type, suite.workers)
      : null;

    const fullCommand = [
      ...commandParts,
      ...filterArgs,
      ...(workersArg ? [workersArg] : []),
      ...resolvedPassThrough,
    ];

    const [cmd, ...args] = fullCommand;
    if (!cmd) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: 'Empty command',
        duration: 0,
      });
      return;
    }

    // detached: true creates a new process group (POSIX only).
    // On Windows, process group killing is a no-op (caught by try/catch in killProcessGroup).
    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      shell: true,
      detached: true,
      env: {
        ...process.env,
        ...options.env,
        FORCE_COLOR: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    // Timeout handler with SIGKILL escalation
    const killProcessGroup = (signal: NodeJS.Signals) => {
      if (proc.pid) {
        try {
          process.kill(-proc.pid, signal);
        } catch {
          // Process group may not exist or already exited
        }
      }
    };

    const timeoutId = options.timeout
      ? setTimeout(() => {
          killed = true;
          killProcessGroup('SIGTERM');
          // Escalate to SIGKILL after grace period
          const gracePeriod = options.killGracePeriod ?? 5000;
          killTimer = setTimeout(() => {
            killProcessGroup('SIGKILL');
          }, gracePeriod);
        }, options.timeout)
      : null;

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;

      // Stream output to callback if provided
      if (options.onOutput) {
        try {
          options.onOutput(chunk);
        } catch {
          // Don't let a faulty callback break stdout capture
        }
      }

      // Prevent unbounded memory growth
      if (stdout.length > MAX_BUFFER) {
        stdout = stdout.slice(-MAX_BUFFER);
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      if (stderr.length > MAX_BUFFER) {
        stderr = stderr.slice(-MAX_BUFFER);
      }
    });

    proc.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killTimer) clearTimeout(killTimer);

      const duration = Date.now() - startTime;

      // Write log file
      await mkdir(dirname(options.logFile), { recursive: true });
      const actualCommand = fullCommand.join(' ');
      const logContent = [
        `Command: ${actualCommand}`,
        `Exit Code: ${code}`,
        `Duration: ${duration}ms`,
        killed ? 'Status: KILLED (timeout)' : '',
        '',
        '=== STDOUT ===',
        stdout,
        '',
        '=== STDERR ===',
        stderr,
      ]
        .filter(Boolean)
        .join('\n');

      await writeFile(options.logFile, logContent);

      resolve({
        exitCode: killed ? 124 : (code ?? 1),
        stdout,
        stderr,
        duration,
      });
    });

    proc.on('error', async (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killTimer) clearTimeout(killTimer);

      const duration = Date.now() - startTime;

      await mkdir(dirname(options.logFile), { recursive: true });
      await writeFile(
        options.logFile,
        `Error: ${error.message}\n\n${stdout}\n${stderr}`,
      );

      resolve({
        exitCode: 1,
        stdout,
        stderr: error.message,
        duration,
      });
    });
  });
}
