/**
 * CLI argument parsing
 */

import minimist from 'minimist';

export interface ParsedArgs {
  suites: string[];
  config?: string;
  env?: string;
  parallel: boolean;
  /** Explicit CLI override; undefined preserves config.parallel. */
  parallelOverride?: boolean;
  failFast: boolean;
  help: boolean;
  version: boolean;
  /** Reporter override (replaces config reporters) */
  reporter: string[];
  /** Grep pattern to filter tests by name */
  grep?: string;
  /** Grep-invert pattern to exclude tests by name */
  grepInvert?: string;
  /** Filter by one or more test file paths */
  file: string[];
  /** Print planned commands without executing */
  dryRun: boolean;
  /** Pass-through arguments for test framework (after -- separator) */
  passThrough: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Split args at -- separator
  const separatorIndex = argv.indexOf('--');
  const cliArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const passThrough =
    separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  const args = minimist(cliArgs, {
    string: ['config', 'env', 'reporter', 'grep', 'grep-invert', 'file'],
    boolean: ['parallel', 'fail-fast', 'help', 'version', 'dry-run'],
    alias: {
      c: 'config',
      e: 'env',
      h: 'help',
      v: 'version',
      r: 'reporter',
      g: 'grep',
      f: 'file',
    },
    default: {
      parallel: true,
    },
  });

  return {
    suites: args._ as string[],
    config: args.config,
    env: args.env,
    parallel: args.parallel && !args['no-parallel'],
    parallelOverride: cliArgs.includes('--no-parallel')
      ? false
      : cliArgs.includes('--parallel') ? true : undefined,
    failFast: args['fail-fast'] ?? false,
    help: args.help ?? false,
    version: args.version ?? false,
    reporter: parseReporterArg(args.reporter),
    grep: args.grep,
    grepInvert: args['grep-invert'],
    file: parseStringList(args.file),
    dryRun: args['dry-run'] ?? false,
    passThrough,
  };
}

function parseStringList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse reporter argument into array.
 * Supports: -r console, -r console,json, -r console -r json
 */
function parseReporterArg(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean));
}
