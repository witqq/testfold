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
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = minimist(argv, {
    string: ['config', 'env'],
    boolean: ['parallel', 'fail-fast', 'help', 'version'],
    alias: {
      c: 'config',
      e: 'env',
      h: 'help',
      v: 'version',
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
  };
}
