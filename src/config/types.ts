/**
 * Configuration Types
 */

/**
 * URL extraction function type
 * Receives env file content and returns extracted URL
 */
export type UrlExtractor = (envContent: string) => string | undefined;

export interface SuiteEnvironment {
  /** Base URL for tests (can be static or extracted) */
  baseUrl?: string;
  /** Path to .env file to load */
  envFile?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Function to extract URL from env file content */
  urlExtractor?: UrlExtractor;
}

export interface Suite {
  /** Display name for the suite */
  name: string;

  /** Parser type: jest, playwright, or custom */
  type: 'jest' | 'playwright' | 'custom';

  /** Command to run the tests */
  command: string;

  /** Path to JSON result file (relative to artifactsDir) */
  resultFile: string;

  /** Path to log file (auto-generated if not specified) */
  logFile?: string;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Number of workers (for Jest) */
  workers?: number;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Multi-environment configuration */
  environments?: Record<string, SuiteEnvironment>;

  /** Custom parser function (for type: 'custom') */
  parser?: string;
}

/** Guard result returned by hooks to influence suite success */
export interface GuardResult {
  ok: boolean;
  error?: string;
}

export interface HooksConfig {
  beforeAll?: () => Promise<void>;
  afterAll?: (results: AggregatedResults) => Promise<void>;
  beforeSuite?: (suite: Suite) => Promise<void | GuardResult>;
  afterSuite?: (suite: Suite, result: SuiteResult) => Promise<void | GuardResult>;
}

export interface Config {
  /** Directory for test artifacts */
  artifactsDir: string;

  /** Base directory for resolving path prefixes (defaults to './tests') */
  testsDir?: string;

  /** Test suites configuration */
  suites: Suite[];

  /** Run suites in parallel (default: true) */
  parallel?: boolean;

  /** Stop on first failure (default: false) */
  failFast?: boolean;

  /** Reporters to use */
  reporters?: Array<'console' | 'json' | 'markdown-failures' | string>;

  /** Lifecycle hooks */
  hooks?: HooksConfig;
}

export interface FailureDetail {
  testName: string;
  filePath: string;
  error: string;
  stack?: string;
  stdout?: string;
  stderr?: string;
  attachments?: Array<{ name: string; path: string }>;
  duration?: number;
}

/** Individual test result for timing analysis */
export interface TestResult {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface SuiteResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  success: boolean;
  failures: FailureDetail[];
  logFile: string;
  resultFile: string;
  /** Individual test results for timing analysis */
  testResults?: TestResult[];
  /** Error category for semantic exit code determination */
  errorCategory?: ErrorCategory;
}

/** Semantic exit codes for agent-friendly error categorization */
export enum ExitCode {
  /** All tests passed */
  PASS = 0,
  /** One or more tests failed */
  TEST_FAILURE = 1,
  /** Infrastructure error (parse failure, spawn error, config error) */
  INFRA_ERROR = 2,
  /** Suite killed by timeout */
  TIMEOUT = 3,
}

/** Error category for a suite result */
export type ErrorCategory = 'none' | 'test_failure' | 'infra_error' | 'timeout';

export interface AggregatedResults {
  suites: SuiteResult[];
  totals: {
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  success: boolean;
  passRate: number;
  /** Semantic exit code for process exit */
  exitCode: ExitCode;
}
