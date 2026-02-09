> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# testfold Capabilities Catalog

> Generated from full source code analysis of `src/` (32 TypeScript files).
> Purpose: function-by-function mapping for migration against MCP Moira and Claude Supervisor.

---

## 1. CLI Flags

Source: `src/cli/args.ts` — uses `minimist` for parsing.

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--config <path>` | `-c` | `string` | Auto-detect (`test-runner.config.{ts,js,mjs}`) | Config file path |
| `--env <name>` | `-e` | `string` | `undefined` | Environment name (local, staging, prod) |
| `--reporter <name>` | `-r` | `string` (repeatable, comma-separated) | `[]` (falls back to config `reporters`) | Override config reporters. Built-in: `console`, `json`, `markdown-failures`, `timing`, `timing-text`, `text`, `summary-log`. Custom: path to module. |
| `--grep <pattern>` | `-g` | `string` | `undefined` | Filter tests by name pattern |
| `--grep-invert <pattern>` | — | `string` | `undefined` | Exclude tests matching pattern |
| `--file <path>` | `-f` | `string` | `undefined` | Filter by test file path |
| `--parallel` | — | `boolean` | `true` | Run suites in parallel |
| `--no-parallel` | — | `boolean` | — | Run suites sequentially (sets `parallel=false`) |
| `--fail-fast` | — | `boolean` | `false` | Stop on first suite failure |
| `--help` | `-h` | `boolean` | `false` | Show help |
| `--version` | `-v` | `boolean` | `false` | Show version |

**Positional arguments:** Suite names to run (e.g., `testfold unit integration`).

**Pass-through arguments:** Everything after `--` separator is passed directly to the test framework command. Path prefix resolution is applied to non-flag arguments.

### ParsedArgs Interface

```typescript
interface ParsedArgs {
  suites: string[];
  config?: string;
  env?: string;
  parallel: boolean;
  failFast: boolean;
  help: boolean;
  version: boolean;
  reporter: string[];
  grep?: string;
  grepInvert?: string;
  file?: string;
  passThrough: string[];
}
```

### Reporter Argument Parsing

`-r` supports three forms:
- Single: `-r console`
- Comma-separated: `-r console,json`
- Repeated: `-r console -r json`

All are normalized into `string[]`.

---

## 2. Config Schema

Sources: `src/config/types.ts`, `src/config/schema.ts`, `src/config/loader.ts`

### Config (top-level)

| Field | Type | Required | Default | Zod Validation |
|-------|------|----------|---------|----------------|
| `artifactsDir` | `string` | **Yes** | — | `z.string().min(1)` |
| `testsDir` | `string` | No | `'./tests'` | `z.string().optional().default('./tests')` |
| `suites` | `Suite[]` | **Yes** | — | `z.array(SuiteSchema).min(1)` |
| `parallel` | `boolean` | No | `true` | `z.boolean().optional().default(true)` |
| `failFast` | `boolean` | No | `false` | `z.boolean().optional().default(false)` |
| `reporters` | `string[]` | No | `['console', 'json', 'markdown-failures']` | `z.array(z.string()).optional().default(...)` |
| `hooks` | `HooksConfig` | No | `undefined` | `HooksSchema` (optional object) |

### Suite

| Field | Type | Required | Default | Zod Validation |
|-------|------|----------|---------|----------------|
| `name` | `string` | **Yes** | — | `z.string().min(1)` |
| `type` | `'jest' \| 'playwright' \| 'custom'` | **Yes** | — | `z.enum(['jest', 'playwright', 'custom'])` |
| `command` | `string` | **Yes** | — | `z.string().min(1)` |
| `resultFile` | `string` | **Yes** | — | `z.string().min(1)` — relative to `artifactsDir` |
| `logFile` | `string` | No | Auto-generated: `resultFile.replace('.json', '.log')` | `z.string().optional()` |
| `timeout` | `number` | No | `undefined` (no timeout) | `z.number().positive().optional()` |
| `workers` | `number` | No | `undefined` | `z.number().int().positive().optional()` |
| `env` | `Record<string, string>` | No | `undefined` | `z.record(z.string()).optional()` |
| `environments` | `Record<string, SuiteEnvironment>` | No | `undefined` | `z.record(SuiteEnvironmentSchema).optional()` |
| `parser` | `string` | No | `undefined` | `z.string().optional()` — path to custom parser module (required when `type: 'custom'`) |

### SuiteEnvironment

| Field | Type | Required | Default | Zod Validation |
|-------|------|----------|---------|----------------|
| `baseUrl` | `string` | No | — | `z.string().url().optional()` |
| `envFile` | `string` | No | — | `z.string().optional()` |
| `env` | `Record<string, string>` | No | — | `z.record(z.string()).optional()` |
| `urlExtractor` | `(envContent: string) => string \| undefined` | No | — | `z.function().args(z.string()).returns(z.string().optional()).optional()` |

### Config File Discovery

Search order (in `src/config/loader.ts`):
1. `test-runner.config.ts`
2. `test-runner.config.js`
3. `test-runner.config.mjs`

Config must have a **default export**. Loaded via dynamic `import()` (ESM).

### defineConfig Helper

```typescript
function defineConfig(config: Config): Config
```

Identity function for TypeScript autocompletion.

---

## 3. Parsers

Source: `src/parsers/`

### Common Interface

```typescript
interface Parser {
  parse(jsonPath: string, logPath?: string): Promise<ParseResult>;
}

interface ParseResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  success: boolean;
  failures: FailureDetail[];
  testResults?: TestResult[];  // For timing analysis
}

interface FailureDetail {
  testName: string;
  filePath: string;
  error: string;
  stack?: string;
  stdout?: string;
  stderr?: string;
  attachments?: Array<{ name: string; path: string }>;
  duration?: number;
}

interface TestResult {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}
```

### 3.1 JestParser (`src/parsers/jest.ts`)

**Parses:** Jest JSON output (`--json` flag format).

**Input format fields:**
- `numPassedTests`, `numFailedTests`, `numPendingTests`, `numTotalTests`, `success`
- `testResults[]` → `{ name, status, message, assertionResults[], startTime, endTime }`
- `assertionResults[]` → `{ ancestorTitles[], title, status, duration, failureMessages[] }`

**Features:**
- **Framework crash detection:** When JSON file is missing, scans log file for error patterns: `Error:`, `ReferenceError`, `SyntaxError`, `TypeError`, `failed to run`, `Timed out`, `ECONNREFUSED`, `Cannot find module`
- **Test suite crash detection:** Handles `fileResult.status === 'failed'` with empty `assertionResults` — counts as crashed suite
- **Error snippet extraction:** From log, finds error line and returns ±2/+10 context lines
- **Test hierarchy:** Builds full name from `ancestorTitles + title` joined by ` > `
- **Duration:** Calculated from `endTime - startTime` per test file
- **Pending/skipped mapping:** Jest `pending` status → `skipped`
- **Empty result file:** Returns success with 0 counts (no tests matched)
- **Produces `testResults[]`** for timing analysis

### 3.2 PlaywrightParser (`src/parsers/playwright.ts`)

**Parses:** Playwright JSON reporter output.

**Input format fields:**
- `stats`: `{ startTime, duration, expected, unexpected, skipped, flaky }`
- `suites[]` → `{ title, file, specs[], suites[] }` (recursive nesting)
- `specs[]` → `{ title, ok, tests[] }`
- `tests[]` → `{ title, results[] }` (multiple results = retries)
- `results[]` → `{ status, duration, error?, errors?, stdout?, stderr?, attachments? }`

**Features:**
- **Recursive suite traversal:** Handles nested suites via `collectResults()`
- **Retry handling:** Takes **last result** from `test.results` array (after retries)
- **Framework crash detection:** Same patterns as Jest + `globalSetup`
- **Corrupted JSON handling:** If `JSON.parse()` fails, falls back to log-based crash detection; returns `Result Parse Error` if no crash detected
- **Empty/missing file:** Same as Jest — success with 0 counts
- **Rich failure details:** Captures from all retry attempts:
  - `stdout`: All `result.stdout[].text` across retries
  - `stderr`: All `result.stderr[].text` across retries
  - `attachments`: All `result.attachments[]` across retries (name + path)
- **Stats mapping:** `expected` → passed, `unexpected` → failed
- **Produces `testResults[]`** for timing analysis

### 3.3 CustomParserLoader (`src/parsers/custom.ts`)

**Loads:** User-provided parser modules via ESM `import()`.

**Module resolution order:**
1. `module.default` as class → `new DefaultClass()` → check `isParser()`
2. `module.default` as object → check `isParser()`
3. `module.parser` named export → check `isParser()`
4. `module` itself → check `isParser()`

**Parser validation:** Object must have `parse` method (`typeof obj.parse === 'function'`).

**Classes:**
- `loadCustomParser(parserPath, cwd)` — standalone loader function
- `CustomParserLoader` — lazy-loading wrapper class implementing `Parser` interface. Loads the actual parser on first `parse()` call and caches it.

---

## 4. Reporters

Source: `src/reporters/`

### Common Interface

```typescript
interface Reporter {
  onStart(suites: Suite[]): void;
  onSuiteComplete(suite: Suite, result: SuiteResult): void;
  onComplete(results: AggregatedResults): Promise<void>;
}
```

### 4.1 ConsoleReporter (`src/reporters/console.ts`)

**Constructor:** `new ConsoleReporter(artifactsDir?: string)`

**Output:** Terminal (stdout) with ANSI colors.

**Behavior:**
- `onStart()`: Prints banner with suite count, records start time
- `onSuiteComplete()`: Prints per-suite result line with ✓/✗ icon, pass/fail counts, duration. Shows first 3 failures with hierarchy and first error line (80 chars max). Shows "+N more" if >3 failures.
- `onComplete()`: Prints summary table (suite name, passed, failed, skipped, time), totals row, pass rate, final status (✓ ALL TESTS PASSED / ✗ TESTS FAILED). **Artifact inventory:** lists generated files (result files, log files, failure reports, timing.json, summary.json).

**Test hierarchy display:** `describe1 > describe2 > test` → `describe1 › describe2 › test`

**Colors used:** red, green, yellow, blue, cyan, gray, bold, reset.

**Special:** Added **last** to reporter array so it sees all generated artifacts from other reporters.

### 4.2 JsonReporter (`src/reporters/json.ts`)

**Constructor:** `new JsonReporter(outputPath: string)`

**Default output path:** `{artifactsDir}/../summary.json`

**Output format (JSON):**
```typescript
{
  timestamp: string;          // ISO 8601
  success: boolean;
  passRate: number;
  totals: { passed, failed, skipped, duration };
  failedTests: string[];      // test names
  errors: string[];           // error messages
  suites: [{
    name, passed, failed, skipped, duration, success,
    resultFile, logFile,
    testResults?: [{ name, file, status, duration, error }]
  }];
}
```

### 4.3 MarkdownReporter (`src/reporters/markdown.ts`)

**Constructor:** `new MarkdownReporter(artifactsDir: string)`

**Output:** Per-test markdown failure reports at `{artifactsDir}/failures/{suite-name}/{NN}-{sanitized-test-name}.md`

**File structure per failure:**
- `# Test Failure Report`
- `## Test Hierarchy` (indented list from `describe > test`)
- `**File:** ...`
- `**Duration:** ...ms` (if available)
- `## Error` (code block, ANSI-stripped)
- `## Stack Trace` (code block, ANSI-stripped, if available)
- `## Stdout` (code block, ANSI-stripped, if available)
- `## Stderr` (code block, ANSI-stripped, if available)
- `## Attachments` (list with name + path, if available)

**Pre-run cleanup:** Deletes and recreates `failures/{suite-name}/` directory.

**Dependencies:** Uses `stripAnsi()`, `sanitizeFilename()` utilities.

### 4.4 TimingReporter (`src/reporters/timing.ts`)

**Constructor:** `new TimingReporter(outputPath: string)`

**Default output path:** `{artifactsDir}/timing.json`

**Output format (JSON):**
```typescript
interface TimingOutput {
  timestamp: string;
  totalDuration: number;
  tests: TimingEntry[];  // sorted by duration DESC (slowest first)
}

interface TimingEntry {
  name: string;
  file: string;
  suite: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}
```

**Behavior:** Collects all `testResults` from all suites, flattens, sorts by duration descending.

### 4.5 TimingTextReporter (`src/reporters/timing-text.ts`)

**Constructor:** `new TimingTextReporter(options: TimingTextOptions)`

```typescript
interface TimingTextOptions {
  outputDir: string;
  topTests?: number;   // default: 30
  topSuites?: number;  // default: 15
}
```

**Output:** Per-suite plain text files at `{outputDir}/{suite-name}-timing.txt`

**Content per file:**
1. Header: suite name + total duration
2. **Top N Slowest Tests** — ranked list with duration, name, file path
3. **Top N Files by Test Duration** — grouped by file, sorted by total test duration, with test count
4. **Setup/Teardown Overhead** — calculated as `suiteDuration - sumOfTestDurations`

**Duration formatting:** `<1000ms` → `{N}ms`, `≥1000ms` → `{N/1000}s` with 1 decimal.

### 4.6 TextReporter (`src/reporters/text.ts`)

**Constructor:** `new TextReporter(outputPath: string)`

**Default output path:** `{artifactsDir}/results.txt`

**Output:** Plain text (no ANSI, no markdown) — designed for CI/tool integration.

**Format:**
```
TEST RESULTS
==================================================

Status: PASSED|FAILED
Pass Rate: XX.X%

Totals:
  Passed:  N
  Failed:  N
  Skipped: N
  Duration: N.Ns

Suites:
--------------------------------------------------
  {name}: PASS|FAIL
    Passed: N, Failed: N, Skipped: N
    Duration: N.Ns
    Failures:
      - {hierarchy}
        File: {path}
        Error: {first 100 chars of error}
```

### 4.7 SummaryLogReporter (`src/reporters/summary-log.ts`)

**Constructor:** `new SummaryLogReporter(outputPath: string)`

**Default output path:** `{artifactsDir}/test-summary.log`

**Output:** Plain text summary table (same layout as ConsoleReporter but without ANSI codes).

**Format:**
```
SUMMARY
───────────────────────────────────────────────────────

Suite                Passed  Failed  Skipped    Time
───────────────────────────────────────────────────────
{name}                   N       N        N    N.Ns
───────────────────────────────────────────────────────
TOTAL                    N       N        N    N.Ns

ALL TESTS PASSED | TESTS FAILED

Pass Rate: XX.X% | Total: N
```

### 4.8 Custom Reporter Loader (`src/reporters/custom.ts`)

**Functions:**
- `loadCustomReporter(reporterPath, cwd, ...constructorArgs)` — loads reporter module
- `isReporterPath(name)` — detects if name is a file path

**isReporterPath detection:** Returns `true` if name starts with `./`, `../`, `/`, or ends with `.ts`, `.js`, `.mjs`.

**Module resolution order (same pattern as custom parser):**
1. `module.default` as class → `new DefaultClass(...constructorArgs)`
2. `module.default` as object
3. `module.reporter` named export
4. `module` itself

**Reporter validation:** Must have `onStart`, `onSuiteComplete`, `onComplete` methods.

### Reporter Registration in Runner

In `TestRunner.createReporters()`:

| Reporter Name | Class | Constructor Args |
|---------------|-------|------------------|
| `'console'` | `ConsoleReporter` | `artifactsDir` |
| `'json'` | `JsonReporter` | `resolve(artifactsDir, '../summary.json')` |
| `'markdown-failures'` | `MarkdownReporter` | `artifactsDir` |
| `'timing'` | `TimingReporter` | `resolve(artifactsDir, 'timing.json')` |
| `'timing-text'` | `TimingTextReporter` | `{ outputDir: artifactsDir }` |
| `'text'` | `TextReporter` | `resolve(artifactsDir, 'results.txt')` |
| `'summary-log'` | `SummaryLogReporter` | `resolve(artifactsDir, 'test-summary.log')` |
| File path | `loadCustomReporter()` | `reporterPath, cwd, artifactsDir` |

**Ordering:** ConsoleReporter is always added **last** (deferred via `consoleReporter` variable).

---

## 5. Hooks System

Source: `src/config/types.ts`, `src/core/orchestrator.ts`

### HooksConfig Interface

```typescript
interface HooksConfig {
  beforeAll?: () => Promise<void>;
  afterAll?: (results: AggregatedResults) => Promise<void>;
  beforeSuite?: (suite: Suite) => Promise<void | GuardResult>;
  afterSuite?: (suite: Suite, result: SuiteResult) => Promise<void | GuardResult>;
}
```

### GuardResult Interface

```typescript
interface GuardResult {
  ok: boolean;
  error?: string;
}
```

### Execution Order

1. **`beforeAll()`** — Called once before any suite executes. No return value expected.
2. **`beforeSuite(suite)`** — Called before each suite. Returns `void` (proceed) or `GuardResult`.
   - If `{ ok: false, error?: string }` → suite is **skipped with failure** (1 failed, 0 passed, error recorded as `beforeSuite Guard` failure). Reporters are notified of the failed result.
3. **Suite execution** (command + parse)
4. **`afterSuite(suite, result)`** — Called after each suite completes and results are parsed. Returns `void` or `GuardResult`.
   - If `{ ok: false, error?: string }` → `result.success = false`, `result.failed += 1`, failure appended as `afterSuite Guard`. Reporters see the **modified** result (guard check happens before reporter notification).
5. **`afterAll(results)`** — Called once after all suites complete and results are aggregated. Receives `AggregatedResults`.

### Guard Detection Logic

```typescript
// Guard is only applied if return value has shape { ok: false }
if (guardResult && typeof guardResult === 'object' && 'ok' in guardResult && !guardResult.ok) {
  // Apply guard failure
}
```

Returning `void`, `undefined`, or `{ ok: true }` has no effect.

---

## 6. Core Features

### 6.1 Orchestrator (`src/core/orchestrator.ts`)

**Constructor options:**

```typescript
interface OrchestratorOptions {
  config: ValidatedConfig;
  reporters: Reporter[];
  environment?: string;
  cwd: string;
  passThrough?: string[];
  envFileVars?: Record<string, string>;
  grep?: string;
  grepInvert?: string;
  file?: string;
}
```

**Capabilities:**

| Feature | Description |
|---------|-------------|
| **Suite filtering** | By name (case-insensitive match against `suite.name`) |
| **Parallel execution** | `Promise.all()` when `config.parallel === true` |
| **Sequential execution** | Iterative with fail-fast support |
| **Fail-fast** | Stops after first failed suite (sequential mode only) |
| **Environment routing** | Per-suite `environments` config with `baseUrl`, `envFile`, `env`, `urlExtractor` |
| **Env variable layering** | Merge order: `suite.env` < `envFileVars` < `envConfig.env` |
| **URL extraction** | Dynamic: `urlExtractor(envContent)` from env file content → sets `TEST_BASE_URL` |
| **Static baseUrl** | Sets `TEST_BASE_URL` from `envConfig.baseUrl` |
| **Graceful error recovery** | Parser failures create synthetic error result instead of throwing |
| **Success determination** | Based on `parseResult.failed === 0 && parseResult.success !== false` (not executor exit code) |
| **Hook lifecycle** | Full beforeAll/afterAll/beforeSuite/afterSuite with guard support |
| **Reporter notifications** | `onStart` → per-suite `onSuiteComplete` (after guard) → `onComplete` |

**Result aggregation:**

```typescript
interface AggregatedResults {
  suites: SuiteResult[];
  totals: { passed, failed, skipped, duration };
  success: boolean;       // totals.failed === 0
  passRate: number;       // (passed / total) * 100, or 100 if no tests
}
```

### 6.2 Executor (`src/core/executor.ts`)

**Function:** `executeCommand(suite: Suite, options: ExecuteOptions): Promise<ExecuteResult>`

```typescript
interface ExecuteOptions {
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
  killGracePeriod?: number;  // default: 5000ms
  logFile: string;
  passThrough?: string[];
  testsDir?: string;
  grep?: string;
  grepInvert?: string;
  file?: string;
  onOutput?: (chunk: string) => void;
}

interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

**Capabilities:**

| Feature | Description |
|---------|-------------|
| **Process spawning** | `child_process.spawn()` with `shell: true`, `detached: true` (new process group) |
| **FORCE_COLOR** | Always sets `FORCE_COLOR=1` in child env |
| **Timeout with SIGKILL escalation** | SIGTERM on timeout → SIGKILL after grace period (default 5s) |
| **Process group killing** | `process.kill(-proc.pid, signal)` — kills entire process group (POSIX) |
| **Exit code 124** | Returned when process was killed by timeout (matches coreutils convention) |
| **Log file writing** | Writes command, exit code, duration, killed status, stdout, stderr to log file |
| **Buffer limit** | 50MB max for stdout/stderr — truncates from start when exceeded |
| **Streaming output** | `onOutput` callback receives stdout chunks in real-time (errors in callback are swallowed) |
| **Pass-through path resolution** | Non-flag, non-path arguments are resolved as test file prefixes via `resolvePathPrefix()` |
| **Workers flag** | Adds `--maxWorkers=N` (Jest) or `--workers=N` (Playwright) from `suite.workers` |
| **Grep/filter args** | Framework-specific argument building via `buildFilterArgs()` |
| **Error handling** | Process error events resolve with exitCode 1 (never reject) |

**buildFilterArgs() mapping:**

| Option | Jest | Playwright | Custom |
|--------|------|------------|--------|
| `grep` | `--testNamePattern=X` | `--grep=X` | `--grep=X` |
| `grepInvert` | `--grep-invert=X` (pass-through) | `--grep-invert=X` | `--grep-invert=X` |
| `file` | Appended directly | Appended directly | Appended directly |

**buildWorkersArg() mapping:**

| Framework | Flag |
|-----------|------|
| Jest | `--maxWorkers=N` |
| Playwright | `--workers=N` |
| Custom | `null` (no flag) |

### 6.3 TestRunner (`src/core/runner.ts`)

**Constructor:** `new TestRunner(config: Config, cwd?: string)`

**Static factory:** `TestRunner.fromConfigFile(configPath?, cwd?): Promise<TestRunner>`

**Run method:**

```typescript
async run(suiteNames?: string[], options: RunOptions = {}): Promise<AggregatedResults>
```

```typescript
interface RunOptions {
  env?: string;
  configPath?: string;
  cwd?: string;
  reporter?: string[];
  passThrough?: string[];
  grep?: string;
  grepInvert?: string;
  file?: string;
}
```

**Capabilities:**

| Feature | Description |
|---------|-------------|
| **Config validation** | Validates via `ConfigSchema.safeParse()` in constructor |
| **Suite filtering** | By name (case-insensitive) |
| **Per-suite artifact cleanup** | Only cleans artifacts for suites being run (preserves others) |
| **Reporter override** | CLI `-r` replaces config `reporters` |
| **Custom reporter loading** | File paths detected via `isReporterPath()`, loaded via `loadCustomReporter()` |
| **Environment loading** | Loads `.env.{name}` files via `loadEnvFile()` |
| **Reporter ordering** | ConsoleReporter always last |
| **Orchestrator delegation** | Creates Orchestrator with all resolved options |

---

## 7. Exported Public API

Source: `src/index.ts`

### Config

| Export | Type | Source |
|--------|------|--------|
| `defineConfig` | `function` | `config/loader.ts` |
| `loadConfig` | `function` | `config/loader.ts` |
| `Config` | type | `config/types.ts` |
| `Suite` | type | `config/types.ts` |
| `SuiteEnvironment` | type | `config/types.ts` |
| `SuiteResult` | type | `config/types.ts` |
| `AggregatedResults` | type | `config/types.ts` |
| `FailureDetail` | type | `config/types.ts` |
| `HooksConfig` | type | `config/types.ts` |
| `GuardResult` | type | `config/types.ts` |
| `UrlExtractor` | type | `config/types.ts` |

### Environment Loading

| Export | Type | Source |
|--------|------|--------|
| `loadEnvFile` | `function` | `config/env-loader.ts` |
| `loadEnvFileFromPath` | `function` | `config/env-loader.ts` |
| `readEnvFileContent` | `function` | `config/env-loader.ts` |
| `extractUrl` | `function` | `config/env-loader.ts` |
| `EnvLoadResult` | type | `config/env-loader.ts` |

### Core

| Export | Type | Source |
|--------|------|--------|
| `TestRunner` | class | `core/runner.ts` |

### Parsers

| Export | Type | Source |
|--------|------|--------|
| `JestParser` | class | `parsers/jest.ts` |
| `PlaywrightParser` | class | `parsers/playwright.ts` |
| `loadCustomParser` | `function` | `parsers/custom.ts` |
| `CustomParserLoader` | class | `parsers/custom.ts` |
| `Parser` | type (interface) | `parsers/types.ts` |
| `ParseResult` | type (interface) | `parsers/types.ts` |

### Reporters

| Export | Type | Source |
|--------|------|--------|
| `ConsoleReporter` | class | `reporters/console.ts` |
| `JsonReporter` | class | `reporters/json.ts` |
| `MarkdownReporter` | class | `reporters/markdown.ts` |
| `TextReporter` | class | `reporters/text.ts` |
| `TimingTextReporter` | class | `reporters/timing-text.ts` |
| `SummaryLogReporter` | class | `reporters/summary-log.ts` |
| `loadCustomReporter` | `function` | `reporters/custom.ts` |
| `isReporterPath` | `function` | `reporters/custom.ts` |
| `Reporter` | type (interface) | `reporters/types.ts` |

### Utilities

| Export | Type | Source |
|--------|------|--------|
| `resolvePathPrefix` | `function` | `utils/path-resolver.ts` |
| `resolvePathPrefixes` | `function` | `utils/path-resolver.ts` |
| `PathResolverOptions` | type | `utils/path-resolver.ts` |

### NOT Exported (internal only)

| Module | Symbols |
|--------|---------|
| `core/orchestrator.ts` | `Orchestrator`, `OrchestratorOptions` |
| `core/executor.ts` | `executeCommand`, `buildFilterArgs`, `buildWorkersArg`, `ExecuteOptions`, `ExecuteResult` |
| `reporters/timing.ts` | `TimingReporter`, `TimingEntry`, `TimingOutput` |
| `utils/ansi.ts` | `stripAnsi`, `hasAnsi` |
| `utils/sanitize.ts` | `sanitizeFilename` |
| `utils/files.ts` | `ensureDir`, `cleanDir`, `writeFileWithDir`, `cleanSuiteArtifacts`, `SuiteArtifacts` |
| `config/schema.ts` | `ConfigSchema`, `SuiteSchema`, `SuiteEnvironmentSchema`, `HooksSchema`, `ValidatedConfig` |

---

## 8. Utilities

### 8.1 ANSI Stripping (`src/utils/ansi.ts`)

```typescript
function stripAnsi(text: string): string
function hasAnsi(text: string): boolean
```

- Regex: `/\x1b\[[0-9;]*m/g`
- `hasAnsi()` uses fresh regex instance to avoid `lastIndex` state bug with global regexes.
- Used by: `MarkdownReporter`

### 8.2 File Operations (`src/utils/files.ts`)

```typescript
function ensureDir(path: string): Promise<void>
function cleanDir(path: string): Promise<void>
function writeFileWithDir(path: string, content: string): Promise<void>
function cleanSuiteArtifacts(artifactsDir: string, suites: SuiteArtifacts[]): Promise<void>
```

| Function | Description |
|----------|-------------|
| `ensureDir` | `mkdir -p` equivalent |
| `cleanDir` | Delete + recreate directory |
| `writeFileWithDir` | Write file, creating parent dirs first |
| `cleanSuiteArtifacts` | Selectively delete result file, log file, and `failures/{suite-name}/` for specified suites only. Uses same sanitization as `MarkdownReporter`. |

```typescript
interface SuiteArtifacts {
  name: string;
  resultFile: string;
  logFile: string;
}
```

### 8.3 Filename Sanitization (`src/utils/sanitize.ts`)

```typescript
function sanitizeFilename(name: string, maxLength = 100): string
```

Pipeline: lowercase → remove special chars (`/[^\w\s-]/g`) → spaces to hyphens → collapse multiple hyphens → trim edge hyphens → truncate to `maxLength`.

### 8.4 Path Prefix Resolution (`src/utils/path-resolver.ts`)

```typescript
function resolvePathPrefix(prefix: string, options: PathResolverOptions): string[]
function resolvePathPrefixes(prefixes: string[], options: PathResolverOptions): string[]
```

```typescript
interface PathResolverOptions {
  baseDir: string;
  extensions?: string[];  // default: ['.test.ts', '.test.js', '.spec.ts', '.spec.js']
}
```

**Behavior:**
1. Recursively finds all test files under `baseDir` (skipping `node_modules`, hidden dirs)
2. Strips test extension from filenames (`auth.test.ts` → `auth`)
3. Matches prefix case-insensitively against stripped names
4. Returns full absolute paths of matches

**Used in executor:** Pass-through arguments that are not flags, not paths (no `/` or `\`), and contain letters are resolved. If exactly 1 match → replaced with full path. Otherwise → kept as-is.

`resolvePathPrefixes()` — batch version, deduplicates via `Set`.

### 8.5 Environment Loading (`src/config/env-loader.ts`)

```typescript
function loadEnvFile(environment: string, cwd: string): EnvLoadResult
function loadEnvFileFromPath(envFilePath: string, cwd: string): EnvLoadResult
function readEnvFileContent(envFilePath: string, cwd: string): string
function extractUrl(envFilePath: string, extractor: UrlExtractor, cwd: string): string | undefined
```

**`loadEnvFile` search patterns:**
1. `.env.{environment}`
2. `.env.{environment}.local`
3. `env/.env.{environment}`
4. `config/.env.{environment}`

Uses `dotenv.config()` for parsing. Returns `{ env: Record<string, string>, loadedFile?: string }`.

---

## Summary: File Count by Module

| Module | Files | Lines (approx) |
|--------|-------|-----------------|
| `cli/` | 2 | 172 |
| `config/` | 5 | 258 |
| `core/` | 4 | 593 |
| `parsers/` | 5 | 385 |
| `reporters/` | 9 | 523 |
| `utils/` | 5 | 227 |
| `index.ts` | 1 | 56 |
| **Total** | **31** | **~2,214** |
