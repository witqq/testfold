# Architecture

## Overview

claude-test-runner is a unified test runner that orchestrates multiple test frameworks (Jest, Playwright) with parallel execution and detailed failure reporting.

## Layer Structure

```
┌─────────────────────────────────────────────────────┐
│                     CLI Layer                        │
│              src/cli/index.ts, args.ts               │
├─────────────────────────────────────────────────────┤
│                    Core Layer                        │
│     TestRunner → Orchestrator → Executor            │
├─────────────────────────────────────────────────────┤
│          Parsers              │      Reporters       │
│   JestParser, PlaywrightParser │ Console, JSON, MD   │
├─────────────────────────────────────────────────────┤
│                   Utils Layer                        │
│          ANSI, Files, Sanitize                       │
├─────────────────────────────────────────────────────┤
│                  Config Layer                        │
│           Schema, Loader, Types                      │
└─────────────────────────────────────────────────────┘
```

## Component Descriptions

### Config Layer (`src/config/`)

- **types.ts** - TypeScript interfaces for configuration
- **schema.ts** - Zod schemas for validation
- **loader.ts** - Loads and validates config from file or object

### Core Layer (`src/core/`)

- **runner.ts** - `TestRunner` class, main entry point
- **orchestrator.ts** - Coordinates suite execution (parallel/sequential)
- **executor.ts** - Spawns child processes, captures output

### Parsers (`src/parsers/`)

- **types.ts** - `Parser` and `ParseResult` interfaces
- **jest.ts** - Parses Jest JSON reporter output
- **playwright.ts** - Parses Playwright JSON reporter output

### Reporters (`src/reporters/`)

- **types.ts** - `Reporter` interface
- **console.ts** - Colored terminal output with summary table
- **json.ts** - Generates `summary.json`
- **markdown.ts** - Individual failure reports in Markdown

### Utils (`src/utils/`)

- **ansi.ts** - Strip ANSI escape codes
- **sanitize.ts** - Sanitize strings for filenames
- **files.ts** - Directory cleanup, file writing

### CLI (`src/cli/`)

- **index.ts** - Entry point, parses args, runs tests
- **args.ts** - Argument parsing with minimist

## Data Flow

```
1. Config Loading
   config file → loader.ts → schema validation → ValidatedConfig

2. Test Execution
   ValidatedConfig → TestRunner → Orchestrator

   Orchestrator:
   ├── For each suite (parallel or sequential):
   │   └── Executor.execute(suite.command)
   │       ├── Spawn process
   │       ├── Capture stdout/stderr
   │       └── Write log file
   │
   └── For each completed suite:
       └── Parser.parse(resultFile, logFile)
           └── ParseResult { passed, failed, failures[] }

3. Reporting
   ParseResult[] → AggregatedResults

   For each Reporter:
   ├── onStart(suites)
   ├── onSuiteComplete(suite, result)
   └── onComplete(aggregated)
```

## Key Interfaces

### Config

```typescript
interface Config {
  artifactsDir: string;
  suites: Suite[];
  parallel?: boolean;
  failFast?: boolean;
  reporters?: ReporterType[];
  hooks?: Hooks;
}

interface Suite {
  name: string;
  type: 'jest' | 'playwright' | 'custom';
  command: string;
  resultFile: string;
  timeout?: number;
  env?: Record<string, string>;
  environments?: Record<string, EnvironmentConfig>;
}
```

### Parser

```typescript
interface Parser {
  parse(jsonPath: string, logPath: string): Promise<ParseResult>;
}

interface ParseResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  success: boolean;
  failures: FailureDetail[];
}
```

### Reporter

```typescript
interface Reporter {
  onStart(suites: Suite[]): void;
  onSuiteComplete(suite: Suite, result: SuiteResult): void;
  onComplete(results: AggregatedResults): Promise<void> | void;
}
```

## Extension Points

### Custom Parsers

Implement `Parser` interface:

```typescript
class CustomParser implements Parser {
  async parse(jsonPath: string, logPath: string): Promise<ParseResult> {
    // Parse custom format
  }
}
```

### Custom Reporters

Implement `Reporter` interface:

```typescript
class SlackReporter implements Reporter {
  onStart(suites: Suite[]) { /* notify */ }
  onSuiteComplete(suite: Suite, result: SuiteResult) { /* notify */ }
  async onComplete(results: AggregatedResults) { /* send summary */ }
}
```

### Hooks

```typescript
hooks: {
  beforeAll: async () => { /* global setup */ },
  afterAll: async (results) => { /* global cleanup */ },
  beforeSuite: async (suite) => { /* suite setup */ },
  afterSuite: async (suite, result) => { /* suite cleanup */ }
}
```

## Error Handling

- Config validation errors throw immediately with detailed messages
- Suite execution errors are captured and reported, don't stop other suites
- Parser errors result in `success: false` with error in failures
- File system errors logged but don't crash the runner
