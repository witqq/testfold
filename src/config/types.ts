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

export interface HooksConfig {
  beforeAll?: () => Promise<void>;
  afterAll?: (results: AggregatedResults) => Promise<void>;
  beforeSuite?: (suite: Suite) => Promise<void>;
  afterSuite?: (suite: Suite, result: SuiteResult) => Promise<void>;
}

export interface Config {
  /** Directory for test artifacts */
  artifactsDir: string;

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
}

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
}
