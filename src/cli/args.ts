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
  reporter?: string;
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
    string: ['config', 'env', 'reporter'],
    boolean: ['parallel', 'fail-fast', 'help', 'version'],
    alias: {
      c: 'config',
      e: 'env',
      h: 'help',
      v: 'version',
      r: 'reporter',
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
    reporter: args.reporter,
    passThrough,
  };
}
