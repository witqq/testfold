> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# Claude Supervisor — Test Scripts Catalog

**Source:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/`
**Files cataloged:** 10
**Date:** 2025-02-08

---

## Table of Contents

1. [agent-stats-guard.js](#1-agent-stats-guardjs)
2. [parse-jest-results.js](#2-parse-jest-resultsjs)
3. [parse-playwright-results.js](#3-parse-playwright-resultsjs)
4. [parse-results.js](#4-parse-resultsjs)
5. [run-all-tests.js](#5-run-all-testsjs)
6. [run-e2e-browser-tests.js](#6-run-e2e-browser-testsjs)
7. [run-e2e-tests.js](#7-run-e2e-testsjs)
8. [run-integration-tests.js](#8-run-integration-testsjs)
9. [run-unit-tests.js](#9-run-unit-testsjs)
10. [telegram-stats-guard.js](#10-telegram-stats-guardjs)

---

## 1. agent-stats-guard.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/agent-stats-guard.js`

**Purpose:** Guards against accidental real Claude LLM API calls during tests. Records `realAgent.requestCount` before and after tests; fails the run if any real Claude API calls were made (delta > 0).

**Module type:** ES Module (`export`)

### Exported Functions

#### `beforeTests()`

- **Signature:** `async function beforeTests(): Promise<void>`
- **Purpose:** Records the initial `realAgent.requestCount` from the agent's `/stats` HTTP endpoint before tests begin.
- **Key details:**
  - Fetches `http://localhost:{AGENT_STATS_PORT}/stats` (default port `7860`, configurable via `AGENT_STATS_PORT` env var).
  - Stores the full stats JSON in module-level `initialStats` variable.
  - Silently skips if the stats endpoint is unreachable (logs warning, sets `initialStats = null`).

#### `afterTests()`

- **Signature:** `async function afterTests(): Promise<{ ok: boolean; realCalls?: number; mockCalls?: number; error?: string }>`
- **Purpose:** Compares final `realAgent.requestCount` with the initial snapshot. Returns `{ ok: false, error }` if real Claude calls were detected.
- **Key details:**
  - Returns `{ ok: true }` immediately if `initialStats` is null (guard was skipped).
  - Computes `realCallsDelta` and `mockCallsDelta` from the difference between final and initial stats.
  - If `realCallsDelta > 0`: logs error, returns `{ ok: false, realCalls, error }`.
  - If `realCallsDelta === 0`: returns `{ ok: true, mockCalls }`.
  - On fetch failure: returns `{ ok: true }` (graceful degradation).

### Internal State

| Variable | Type | Description |
|----------|------|-------------|
| `AGENT_STATS_PORT` | `string` | Port for agent stats endpoint (env `AGENT_STATS_PORT`, default `'7860'`) |
| `AGENT_STATS_URL` | `string` | Full URL: `http://localhost:{port}/stats` |
| `initialStats` | `object \| null` | Module-level state storing the pre-test stats snapshot |

### External Dependencies

- None (uses native `fetch`)

### Integration Points

- **Consumed by:** `run-e2e-browser-tests.js`, `run-e2e-tests.js`, `run-integration-tests.js`
- **External service:** SupervisorAgent `/stats` HTTP endpoint

---

## 2. parse-jest-results.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/parse-jest-results.js`

**Purpose:** Parses Jest JSON result files, prints a summary, generates individual per-test-failure markdown reports in a failures directory, generates timing statistics, and outputs a structured JSON summary as the last stdout line for consumption by parent runners.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| `argv[2]` | `result-file` | Yes | Path to Jest JSON result file (e.g. `unit.json`) |
| `argv[3]` | `log-file` | Yes | Path to combined output log file |
| `argv[4]` | `failures-dir` | No | Directory for individual failure `.md` files |

**Usage:** `node parse-jest-results.js <result.json> <output.log> [failures-dir]`

### Internal Functions

#### `stripAnsi(text)`

- **Signature:** `function stripAnsi(text: string): string`
- **Purpose:** Removes ANSI escape codes from text using regex `/\x1b\[[0-9;]*m/g`.

#### `sanitizeFilename(name)`

- **Signature:** `function sanitizeFilename(name: string): string`
- **Purpose:** Converts test name to safe filename: removes non-word chars, replaces spaces with hyphens, lowercases, truncates to 100 chars.

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `{failures-dir}/NN-test-name.md` | Markdown | One file per failed test with name, file, status, error details in fenced code block |
| `{artifacts-dir}/{category}-timing.txt` | Plain text | Timing statistics: top 30 slowest tests, top 15 suites by setup/teardown time |

### JSON Output (last stdout line)

```json
{
  "passed": number,
  "failed": number,
  "skipped": number,
  "time": "N.Ns",
  "success": boolean,
  "errors": string[],
  "failedTests": string[]
}
```

### Key Implementation Details

1. **Stats extraction:** Reads `numPassedTests`, `numFailedTests`, `numTotalTests`, `numPendingTests` from Jest JSON. Computes total time by summing `(endTime - startTime)` across all `testResults`.
2. **Framework crash detection:** If `total === 0` and log file exists, searches for error patterns (`Error:`, `ReferenceError`, `SyntaxError`, `TypeError`, `ECONNREFUSED`) and shows a snippet (±2/+10 lines around first match).
3. **Failure reports:** Iterates `data.testResults[].assertionResults[]` where `status === "failed"`. Creates numbered markdown files (`01-name.md`, `02-name.md`, ...) with test name, file path, and `failureMessages` in code blocks.
4. **Timing statistics:** Collects per-test durations from `assertionResults[].duration` and per-suite setup/teardown time (suite total minus sum of test durations). Writes sorted lists to `{category}-timing.txt`.
5. **Exit code:** `1` if any failures, `0` otherwise. On parse error, outputs error JSON and exits `1`.

### External Dependencies

- `fs` (readFileSync, existsSync, writeFileSync, mkdirSync)
- `path` (join, dirname, basename)

### Integration Points

- **Called by:** `run-unit-tests.js`, `run-integration-tests.js`, `run-e2e-tests.js` (via `spawn`)
- **Protocol:** Last stdout line must be valid JSON for parent runner to parse.

---

## 3. parse-playwright-results.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/parse-playwright-results.js`

**Purpose:** Parses Playwright JSON result files, prints a summary, generates individual per-test-failure markdown reports (including STDOUT, STDERR, and attachments), generates timing statistics, and outputs a structured JSON summary as the last stdout line.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| `argv[2]` | `result-file` | Yes | Path to Playwright JSON result file |
| `argv[3]` | `log-file` | Yes | Path to combined output log file |
| `argv[4]` | `failures-dir` | No | Directory for individual failure `.md` files |

**Usage:** `node parse-playwright-results.js <result.json> <output.log> [failures-dir]`

### Internal Functions

#### `stripAnsi(text)`

- **Signature:** `function stripAnsi(text: string): string`
- **Purpose:** Removes ANSI escape codes (same implementation as Jest parser).

#### `sanitizeFilename(name)`

- **Signature:** `function sanitizeFilename(name: string): string`
- **Purpose:** Same as Jest parser — safe filename generation.

#### `collectFailures(suites)` (closure)

- **Signature:** `const collectFailures = (suites: PlaywrightSuite[]): void`
- **Purpose:** Recursively traverses Playwright's nested suite/spec/test/result structure. For each failed spec, extracts the **last attempt** (final retry result) and writes a markdown failure report.
- **Key details:**
  - Checks `spec.ok === false` for failure.
  - Only writes report for `lastResult.status === "failed"` or `"timedOut"`.
  - Report sections: Error (from `lastResult.error` and `lastResult.errors[]`), STDOUT (from `lastResult.stdout[].text`), STDERR (from `lastResult.stderr[].text`), Attachments (from `lastResult.attachments[]` with name and path).

#### `collectTimings(suites)` (closure)

- **Signature:** `const collectTimings = (suites: PlaywrightSuite[]): void`
- **Purpose:** Recursively collects test durations from the last result of each test for timing statistics.

#### `collectFailedNames(suites)` (closure)

- **Signature:** `const collectFailedNames = (suites: PlaywrightSuite[]): void`
- **Purpose:** Recursively collects titles of all failed specs (`spec.ok === false`) into `failedTestNames` array.

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `{failures-dir}/NN-test-name.md` | Markdown | Per-test failure: name, file, status, duration, error, stdout, stderr, attachments |
| `{artifacts-dir}/{category}-timing.txt` | Plain text | Top 30 slowest tests sorted by duration |

### JSON Output (last stdout line)

```json
{
  "passed": number,
  "failed": number,
  "skipped": number,
  "time": "N.Ns",
  "success": boolean,
  "errors": string[],
  "failedTests": string[]
}
```

### Key Implementation Details

1. **Stats extraction:** Reads from `data.stats`: `expected` (passed), `unexpected` (failed), `skipped`, `duration`.
2. **Framework crash detection:** Same pattern as Jest parser — checks log file for error patterns if `total === 0`.
3. **Retry handling:** Only processes the last result of each test (`test.results[test.results.length - 1]`), reflecting the final outcome after retries.
4. **Playwright-specific data:** Captures stdout/stderr arrays (each item has `.text`), and attachment metadata (screenshots, videos with `.name` and `.path`).
5. **Timing stats:** No suite-level setup/teardown analysis (unlike Jest parser) — only individual test timings.

### External Dependencies

- `fs` (readFileSync, existsSync, writeFileSync, mkdirSync)
- `path` (join, dirname, basename)

### Integration Points

- **Called by:** `run-e2e-browser-tests.js` (via `spawn`)
- **Protocol:** Last stdout line must be valid JSON.

---

## 4. parse-results.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/parse-results.js`

**Purpose:** Legacy/simple Jest result parser. Reads a Jest JSON file, prints a human-readable summary to stdout, and exits with appropriate code. Does **not** generate failure files or timing stats.

**Module type:** CommonJS (`require`/`module.exports` implicit)

### CLI Arguments

| Position | Name | Required | Description |
|----------|------|----------|-------------|
| `argv[2]` | `results.json` | Yes | Path to Jest JSON result file |

**Usage:** `node parse-results.js <results.json>`

### Internal Functions

#### `parseResults(filePath)`

- **Signature:** `function parseResults(filePath: string): { exitCode: number; summary: object }`
- **Purpose:** Parses Jest JSON, prints formatted summary (status, total, passed, failed, pending, duration). If failures exist, prints each failed test with first line of failure message.
- **Return value:** `{ exitCode: 0|1, summary: { success, numTotalTests, numPassedTests, numFailedTests, numPendingTests, startTime, duration } }`
- **Key details:**
  - Computes duration as `(Date.now() - data.startTime) / 1000`.
  - Iterates `data.testResults[].assertionResults[]` for failed tests, showing `ancestorTitles.join(' > ') > title`.
  - Only shows first line of each failure message.

### Output Files Generated

None.

### External Dependencies

- `fs` (readFileSync, existsSync)
- `path` (resolve)

### Integration Points

- **Standalone utility** — not imported by other scripts in this directory. Likely superseded by `parse-jest-results.js`.

---

## 5. run-all-tests.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/run-all-tests.js`

**Purpose:** Top-level test orchestrator. Runs all test suites (unit, integration, e2e-jest, e2e-browser) sequentially via `execSync`, collects JSON results from each, and generates a unified colored summary report with pass rates, failed test listings, and a plain-text log file.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments/Flags

| Argument | Type | Description |
|----------|------|-------------|
| `unit` | Positional | Run only unit tests |
| `integration` | Positional | Run only integration tests |
| `e2e` | Positional | Run only E2E Jest tests |
| `browser` | Positional | Run only E2E Browser tests |
| `--grep <pattern>` | Flag | Pass grep pattern to child runners |
| `--grep-invert <pattern>` | Flag | Pass grep-invert pattern to child runners |
| `--file <path>` | Flag | Pass file filter to child runners |

Multiple suite aliases can be combined: `node run-all-tests.js unit integration`

**Usage:**
```
node tests/scripts/run-all-tests.js                    # All suites
node tests/scripts/run-all-tests.js unit               # Unit only
node tests/scripts/run-all-tests.js browser --grep "UC130"  # Browser + grep
```

### Internal Functions

#### `parseArgs(args)`

- **Signature:** `function parseArgs(args: string[]): { suites: string[]; grep: string|null; grepInvert: string|null; file: string|null }`
- **Purpose:** Parses CLI arguments into structured object. Non-`--` args become suite filters; `--grep`, `--grep-invert`, `--file` are extracted as named options.

#### `stripAnsi(text)`

- **Signature:** `function stripAnsi(text: string): string`
- **Purpose:** Removes ANSI escape codes.

#### `log(message)`

- **Signature:** `function log(message?: string): void`
- **Purpose:** Dual output — prints to console AND appends to `logOutput` array for later file write.

#### `buildFilterArgs()`

- **Signature:** `function buildFilterArgs(): string`
- **Purpose:** Constructs a space-separated string of `--grep`, `--grep-invert`, `--file` flags from parsed CLI args, to append to each child runner command.

#### `runTestSuite(suite, index, total)`

- **Signature:** `function runTestSuite(suite: { name: string; command: string }, index: number, total: number): ResultObject`
- **Purpose:** Executes a child runner via `execSync`, parses the JSON from the last stdout line.
- **Key details:**
  - `maxBuffer: 50 * 1024 * 1024` (50 MB).
  - On `execSync` error (non-zero exit), still attempts to parse JSON from `error.stdout` last line.
  - On JSON parse failure, returns default result with error messages including stderr (first 500 chars).
  - Returns: `{ passed, failed, skipped, time, success, errors, failedTests }`.

#### `formatNum(num, color)`

- **Signature:** `function formatNum(num: number, color: string): string`
- **Purpose:** Right-pads number to 8 chars with optional color; shows `0` without color.

### Suite Definitions

| Suite Name | Command | Alias |
|-----------|---------|-------|
| Unit | `node {scriptsDir}/run-unit-tests.js {filterArgs}` | `unit` |
| Integration | `node {scriptsDir}/run-integration-tests.js {filterArgs}` | `integration` |
| E2E (Jest) | `node {scriptsDir}/run-e2e-tests.js {filterArgs}` | `e2e` |
| E2E (Browser) | `node {scriptsDir}/run-e2e-browser-tests.js {filterArgs}` | `browser` |

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `test-results/test-summary.log` | Plain text (ANSI-stripped) | Full summary report without color codes |

### Report Sections

1. Header with suite label
2. Per-suite immediate result (✓/⚠/✗)
3. Per-suite error messages and failed test names (max 10 shown inline)
4. Summary table: Suite / Passed / Failed / Skipped / Time
5. Totals row with pass rate percentage
6. ALL PASSED or SOME FAILED banner
7. On failure: consolidated list of all failed tests across suites, all runner errors, re-run instructions

### External Dependencies

- `child_process` (execSync)
- `fs` (writeFileSync, mkdirSync)
- `dotenv` (loads `.env` from project root)
- `url` (fileURLToPath)
- `path`

### Integration Points

- **Calls:** `run-unit-tests.js`, `run-integration-tests.js`, `run-e2e-tests.js`, `run-e2e-browser-tests.js` via `execSync`
- **Protocol:** Expects each child to output JSON as last stdout line.
- **Entry point:** Likely invoked by `npm test` in `package.json`.

---

## 6. run-e2e-browser-tests.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/run-e2e-browser-tests.js`

**Purpose:** Runs Playwright browser-based E2E tests with real-time progress streaming, AgentGuard and TelegramGuard protection, a 10-minute suite timeout, and post-run parsing via `parse-playwright-results.js`.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments/Flags

| Argument | Type | Description |
|----------|------|-------------|
| `--grep <pattern>` | Flag | Playwright `--grep` filter |
| `--grep-invert <pattern>` | Flag | Playwright `--grep-invert` filter |
| `--file <path>` | Flag | Specific test file (auto-resolves to `tests/e2e/{file}.spec.ts`) |
| `--reporter <name>` | Flag | Override Playwright reporter (default: `list`; `json` always appended) |
| Other args | Passthrough | Forwarded directly to Playwright |

**Usage:**
```
node run-e2e-browser-tests.js --grep "UC130" --reporter=dot
```

### Internal Functions

#### `parseArgs()`

- **Signature:** `function parseArgs(): { grep: string|null; grepInvert: string|null; file: string|null; reporter: string|null; passthrough: string[] }`
- **Purpose:** Parses CLI args, extracting known flags and collecting the rest as passthrough args for Playwright.
- **Key details:** Supports both `--reporter=list` and `--reporter list` syntax.

### Execution Flow

1. **Artifact cleanup:** Removes old `e2e-browser.json`, `e2e-browser.log`, `failures/e2e-browser/` directory.
2. **Guard initialization:** `await agentBefore()` and `await telegramBefore()`.
3. **Playwright spawn:** Runs `npx playwright test` with constructed args.
   - Sets `PLAYWRIGHT_JSON_OUTPUT_NAME` env var for JSON reporter output path.
   - Sets `FORCE_COLOR: "1"` for colored output.
   - Reporter format: `{reporter},json` (e.g., `list,json`).
4. **Real-time progress:** Parses stdout for `✓`/`✔`/`passed` and `✘`/`✗`/`failed` markers; prints progress every 10 tests.
5. **Stdout/stderr capture:** Appends all output to `e2e-browser.log` via `appendFileSync`.
6. **Suite timeout:** 10 minutes (`600,000 ms`). On timeout, kills process with `SIGKILL`.
7. **Guard checks:** `await agentAfter()` and `await telegramAfter()`.
8. **Parser invocation:** Spawns `parse-playwright-results.js` with JSON file, log file, and failures dir; inherits stdio.
9. **Exit code:** First non-zero of: Playwright exit code, parser exit code, guard error (1).

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `test-results/artifacts/e2e-browser.json` | JSON | Full Playwright JSON report |
| `test-results/artifacts/e2e-browser.log` | Text | Combined stdout + stderr |
| `test-results/artifacts/failures/e2e-browser/NN-name.md` | Markdown | Per-test failure reports (via parser) |
| `test-results/artifacts/e2e-browser-timing.txt` | Text | Timing statistics (via parser) |

### External Dependencies

- `child_process` (spawn)
- `fs` (writeFileSync, mkdirSync, existsSync, rmSync, appendFileSync)
- `dotenv` (loads `.env` from project root)
- `url` (fileURLToPath)
- `path`

### Integration Points

- **Imports:** `agent-stats-guard.js` (`beforeTests`, `afterTests`), `telegram-stats-guard.js` (`beforeTests`, `afterTests`)
- **Calls:** `parse-playwright-results.js` (via spawn)
- **Called by:** `run-all-tests.js` (via execSync)

---

## 7. run-e2e-tests.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/run-e2e-tests.js`

**Purpose:** Runs Jest-based E2E tests (non-browser) using a dedicated `jest.e2e.config.cjs`, with AgentGuard and TelegramGuard protection, and post-run parsing via `parse-jest-results.js`.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments/Flags

| Argument | Type | Description |
|----------|------|-------------|
| `--grep <pattern>` | Flag | Maps to Jest `--testNamePattern` |
| `--grep-invert <pattern>` | Flag | Parsed but not used (Jest doesn't support invert natively) |
| `--file <path>` | Flag | Specific test file (auto-resolves to `tests/e2e/{file}.spec.ts`) |

**Usage:**
```
node run-e2e-tests.js --grep "permission" --file permission-flow
```

### Internal Functions

#### `parseArgs()`

- **Signature:** `function parseArgs(): { grep: string|null; grepInvert: string|null; file: string|null }`
- **Purpose:** Extracts `--grep`, `--grep-invert`, and `--file` from `process.argv`.

### Execution Flow

1. **Env loading:** `dotenv.config` from `.env.test` (note: `.env.test`, not `.env`).
2. **Artifact cleanup:** Removes old `e2e-jest.json`, `e2e-jest.log`, `failures/e2e-jest/`.
3. **Guard initialization:** `await agentBefore()` and `await telegramBefore()`.
4. **Jest spawn:** `npx jest --config jest.e2e.config.cjs --json --outputFile={jsonFile}`.
   - `--grep` mapped to `--testNamePattern`.
   - `--file` resolves shorthand to `tests/e2e/{file}.spec.ts`.
5. **Output capture:** Buffers all stdout and stderr in memory.
6. **On close:** Writes combined log, checks guards, spawns `parse-jest-results.js`.
7. **Exit code:** First non-zero of: Jest exit code, parser exit code, guard error (1).

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `test-results/artifacts/e2e-jest.json` | JSON | Full Jest JSON report |
| `test-results/artifacts/e2e-jest.log` | Text | Combined stdout + stderr |
| `test-results/artifacts/failures/e2e-jest/NN-name.md` | Markdown | Per-test failure reports (via parser) |
| `test-results/artifacts/e2e-jest-timing.txt` | Text | Timing statistics (via parser) |

### External Dependencies

- `child_process` (spawn)
- `fs` (writeFileSync, mkdirSync, existsSync, rmSync)
- `dotenv` (loads `.env.test`)
- `url` (fileURLToPath)
- `path`

### Integration Points

- **Imports:** `agent-stats-guard.js`, `telegram-stats-guard.js`
- **Calls:** `parse-jest-results.js` (via spawn)
- **Called by:** `run-all-tests.js` (via execSync)

---

## 8. run-integration-tests.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/run-integration-tests.js`

**Purpose:** Runs Jest integration tests from `tests/integration/` directory, with AgentGuard and TelegramGuard protection, and post-run parsing via `parse-jest-results.js`.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments/Flags

| Argument | Type | Description |
|----------|------|-------------|
| `--grep <pattern>` | Flag | Maps to Jest `--testNamePattern` |
| `--file <path>` | Flag | Specific test file (auto-resolves to `tests/integration/{file}.test.ts`) |

**Usage:**
```
node run-integration-tests.js --grep "NATS" --file nats-events
```

### Internal Functions

#### `parseArgs()`

- **Signature:** `function parseArgs(): { grep: string|null; file: string|null }`
- **Purpose:** Extracts `--grep` and `--file` from `process.argv`. Note: does **not** support `--grep-invert`.

### Execution Flow

1. **Env loading:** `dotenv.config` from `.env`.
2. **Artifact cleanup:** Removes old `integration.json`, `integration.log`, `failures/integration/`.
3. **Guard initialization:** `await agentBefore()` and `await telegramBefore()`.
4. **Jest spawn:** `npx jest tests/integration --json --outputFile={jsonFile}`.
   - `--grep` mapped to `--testNamePattern`.
   - `--file` replaces `tests/integration` in args[1] with `tests/integration/{file}.test.ts`.
5. **Output capture:** Buffers stdout and stderr.
6. **On close:** Writes combined log, checks guards, spawns parser.
7. **Exit code:** First non-zero of: Jest exit code, parser exit code, guard error (1).

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `test-results/artifacts/integration.json` | JSON | Full Jest JSON report |
| `test-results/artifacts/integration.log` | Text | Combined stdout + stderr |
| `test-results/artifacts/failures/integration/NN-name.md` | Markdown | Per-test failure reports (via parser) |
| `test-results/artifacts/integration-timing.txt` | Text | Timing statistics (via parser) |

### External Dependencies

- `child_process` (spawn)
- `fs` (writeFileSync, mkdirSync, existsSync, rmSync)
- `dotenv` (loads `.env`)
- `url` (fileURLToPath)
- `path`

### Integration Points

- **Imports:** `agent-stats-guard.js`, `telegram-stats-guard.js`
- **Calls:** `parse-jest-results.js` (via spawn)
- **Called by:** `run-all-tests.js` (via execSync)

---

## 9. run-unit-tests.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/run-unit-tests.js`

**Purpose:** Runs Jest unit tests from `tests/unit/` directory. Unlike integration/e2e runners, does **not** include AgentGuard or TelegramGuard checks (unit tests don't interact with external services). Post-run parsing via `parse-jest-results.js`.

**Module type:** ES Module (script, no exports — runs as CLI)

### CLI Arguments/Flags

| Argument | Type | Description |
|----------|------|-------------|
| `--grep <pattern>` | Flag | Maps to Jest `--testNamePattern` |
| `--file <path>` | Flag | Specific test file (auto-resolves to `tests/unit/{file}.test.ts`) |

**Usage:**
```
node run-unit-tests.js --grep "BaseStore" --file config
```

### Internal Functions

#### `parseArgs()`

- **Signature:** `function parseArgs(): { grep: string|null; file: string|null }`
- **Purpose:** Extracts `--grep` and `--file` from `process.argv`.

### Execution Flow

1. **Env loading:** `dotenv.config` from `.env`.
2. **Artifact cleanup:** Removes old `unit.json`, `unit.log`, `failures/unit/`.
3. **Jest spawn:** `npx jest tests/unit --json --outputFile={jsonFile}`.
   - `--grep` mapped to `--testNamePattern`.
   - `--file` replaces `tests/unit` in args[1] with `tests/unit/{file}.test.ts`.
4. **Output capture:** Buffers stdout and stderr.
5. **On close:** Writes combined log, spawns parser (no guard checks).
6. **Exit code:** First non-zero of: Jest exit code, parser exit code.

### Output Files Generated

| File | Format | Description |
|------|--------|-------------|
| `test-results/artifacts/unit.json` | JSON | Full Jest JSON report |
| `test-results/artifacts/unit.log` | Text | Combined stdout + stderr |
| `test-results/artifacts/failures/unit/NN-name.md` | Markdown | Per-test failure reports (via parser) |
| `test-results/artifacts/unit-timing.txt` | Text | Timing statistics (via parser) |

### External Dependencies

- `child_process` (spawn)
- `fs` (writeFileSync, mkdirSync, existsSync, rmSync)
- `dotenv` (loads `.env`)
- `url` (fileURLToPath)
- `path`

### Integration Points

- **Does NOT import:** `agent-stats-guard.js`, `telegram-stats-guard.js` (key difference from other runners)
- **Calls:** `parse-jest-results.js` (via spawn)
- **Called by:** `run-all-tests.js` (via execSync)

---

## 10. telegram-stats-guard.js

**Full path:** `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/telegram-stats-guard.js`

**Purpose:** Guards against accidental real Telegram API messages during tests. Records `realTelegram.totalCount` before and after tests; fails the run if any real Telegram messages were sent (delta > 0).

**Module type:** ES Module (`export`)

### Exported Functions

#### `beforeTests()`

- **Signature:** `async function beforeTests(): Promise<void>`
- **Purpose:** Records the initial `realTelegram.totalCount` from the Telegram service's `/stats` endpoint before tests begin.
- **Key details:**
  - Fetches `http://localhost:{TELEGRAM_STATS_PORT}/stats` (default port `7861`, configurable via `TELEGRAM_STATS_PORT` env var).
  - Stores full stats JSON in module-level `initialStats`.
  - Silently skips if endpoint unreachable.

#### `afterTests()`

- **Signature:** `async function afterTests(): Promise<{ ok: boolean; realCount?: number; mockCount?: number; skippedCount?: number; error?: string }>`
- **Purpose:** Compares final `realTelegram.totalCount` with initial snapshot. Returns `{ ok: false, error }` if real Telegram messages were sent.
- **Key details:**
  - Computes three deltas: `realDelta` (from `realTelegram.totalCount`), `mockDelta` (from `mockTelegram.totalCount`), `skippedDelta` (from `skippedTestSessions`).
  - If `realDelta > 0`: returns `{ ok: false, realCount, error }`.
  - If `realDelta === 0`: returns `{ ok: true, mockCount, skippedCount }`.
  - On fetch failure or missing initial stats: returns `{ ok: true }`.

### Internal State

| Variable | Type | Description |
|----------|------|-------------|
| `TELEGRAM_STATS_PORT` | `string` | Port for Telegram stats endpoint (env `TELEGRAM_STATS_PORT`, default `'7861'`) |
| `TELEGRAM_STATS_URL` | `string` | Full URL: `http://localhost:{port}/stats` |
| `initialStats` | `object \| null` | Module-level state storing the pre-test stats snapshot |

### External Dependencies

- None (uses native `fetch`)

### Integration Points

- **Consumed by:** `run-e2e-browser-tests.js`, `run-e2e-tests.js`, `run-integration-tests.js`
- **External service:** Telegram notification service `/stats` HTTP endpoint

---

## Cross-Cutting Summary

### Architecture Diagram

```
run-all-tests.js (orchestrator)
  ├── run-unit-tests.js ──────────────────────────► parse-jest-results.js
  ├── run-integration-tests.js ──┬── guards ──────► parse-jest-results.js
  ├── run-e2e-tests.js ──────────┤                ► parse-jest-results.js
  └── run-e2e-browser-tests.js ──┘                ► parse-playwright-results.js

Guards (imported by integration, e2e-jest, e2e-browser):
  ├── agent-stats-guard.js      → SupervisorAgent /stats
  └── telegram-stats-guard.js   → Telegram service /stats

Legacy (standalone):
  └── parse-results.js
```

### Communication Protocol

All child runners output a JSON object as the **last line of stdout**:
```json
{
  "passed": number,
  "failed": number,
  "skipped": number,
  "time": "N.Ns",
  "success": boolean,
  "errors": string[],
  "failedTests": string[]
}
```

`run-all-tests.js` parses this JSON from the last line of each child's stdout/stderr capture.

### Shared Patterns Across Files

| Pattern | Files | Description |
|---------|-------|-------------|
| `stripAnsi()` | 4 files | Same regex `\x1b\[[0-9;]*m` |
| `sanitizeFilename()` | 2 parsers | Same logic: strip non-word, hyphenate, lowercase, truncate 100 |
| `parseArgs()` | 5 runners | Similar CLI arg parsing with `--grep`, `--file` |
| Artifact cleanup | 4 runners | `rmSync` + `mkdirSync` for JSON, log, failures dir |
| Guard before/after | 3 runners | `agentBefore()/agentAfter()` + `telegramBefore()/telegramAfter()` |
| Framework crash detection | 2 parsers | Check for 0 total tests + error patterns in log file |

### npm Packages Used (across all files)

| Package | Used By |
|---------|---------|
| `dotenv` | `run-all-tests.js`, `run-e2e-browser-tests.js`, `run-e2e-tests.js`, `run-integration-tests.js`, `run-unit-tests.js` |
| Node.js built-ins (`fs`, `path`, `child_process`, `url`) | All files |
| Native `fetch` | `agent-stats-guard.js`, `telegram-stats-guard.js` |
