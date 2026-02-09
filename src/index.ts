/**
 * testfold
 *
 * Unified test runner with Jest and Playwright support,
 * parallel execution, and detailed failure reporting.
 */

// Config
export { defineConfig, loadConfig } from './config/index.js';
export type {
  Config,
  Suite,
  SuiteEnvironment,
  SuiteResult,
  AggregatedResults,
  FailureDetail,
  HooksConfig,
  GuardResult,
  UrlExtractor,
  ErrorCategory,
} from './config/index.js';
export { ExitCode } from './config/index.js';

// Environment loading
export {
  loadEnvFile,
  loadEnvFileFromPath,
  readEnvFileContent,
  extractUrl,
  type EnvLoadResult,
} from './config/index.js';

// Core
export { TestRunner } from './core/runner.js';

// Parsers
export { JestParser } from './parsers/jest.js';
export { PlaywrightParser } from './parsers/playwright.js';
export { loadCustomParser, CustomParserLoader } from './parsers/custom.js';
export type { Parser, ParseResult } from './parsers/types.js';

// Reporters
export { ConsoleReporter } from './reporters/console.js';
export { JsonReporter } from './reporters/json.js';
export { MarkdownReporter } from './reporters/markdown.js';
export { TextReporter } from './reporters/text.js';
export { TimingTextReporter } from './reporters/timing-text.js';
export { SummaryLogReporter } from './reporters/summary-log.js';
export { loadCustomReporter, isReporterPath } from './reporters/custom.js';
export type { Reporter } from './reporters/types.js';

// Utils
export {
  resolvePathPrefix,
  resolvePathPrefixes,
  type PathResolverOptions,
} from './utils/path-resolver.js';
