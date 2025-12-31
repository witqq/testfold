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
} from './config/index.js';

// Core
export { TestRunner } from './core/runner.js';

// Parsers
export { JestParser } from './parsers/jest.js';
export { PlaywrightParser } from './parsers/playwright.js';
export type { Parser, ParseResult } from './parsers/types.js';

// Reporters
export { ConsoleReporter } from './reporters/console.js';
export { JsonReporter } from './reporters/json.js';
export { MarkdownReporter } from './reporters/markdown.js';
export type { Reporter } from './reporters/types.js';
