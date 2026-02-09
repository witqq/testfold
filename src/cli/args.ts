/**
 * CLI argument parsing
 */

import minimist from 'minimist';

export interface ParsedArgs {
  suites: string[];
  config?: string;
  env?: string;
  parallel: boolean;
  failFast: boolean;
  help: boolean;
  version: boolean;
  /** Reporter override (replaces config reporters) */
  reporter: string[];
  /** Grep pattern to filter tests by name */
  grep?: string;
  /** Grep-invert pattern to exclude tests by name */
  grepInvert?: string;
  /** Filter by test file path */
  file?: string;
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
    failFast: args['fail-fast'] ?? false,
    help: args.help ?? false,
    version: args.version ?? false,
    reporter: parseReporterArg(args.reporter),
    grep: args.grep,
    grepInvert: args['grep-invert'],
    file: args.file,
    dryRun: args['dry-run'] ?? false,
    passThrough,
  };
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
