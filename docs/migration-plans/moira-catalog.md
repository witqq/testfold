> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# MCP Moira Test Scripts — Complete Catalog

**Source:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/`
**Generated:** 2025-02-08

---

## Table of Contents

1. [detect-test-env.js](#1-detect-test-envjs) — Shared utility
2. [parse-jest-results.js](#2-parse-jest-resultsjs) — Jest parser
3. [parse-playwright-results.js](#3-parse-playwright-resultsjs) — Playwright parser
4. [run-unit-tests.js](#4-run-unit-testsjs) — Unit runner
5. [run-integration-tests.js](#5-run-integration-testsjs) — Integration runner
6. [run-workflow-tests.js](#6-run-workflow-testsjs) — Workflow runner
7. [run-api-tests.js](#7-run-api-testsjs) — API runner
8. [run-mcp-tools-tests.js](#8-run-mcp-tools-testsjs) — MCP Tools runner
9. [run-e2e-tests.js](#9-run-e2e-testsjs) — E2E runner
10. [run-all-tests.js](#10-run-all-testsjs) — Orchestrator (at `tests/` level)

---

## Architecture Overview

```
tests/run-all-tests.js          ← Orchestrator: runs all 6 suites in parallel
  │
  ├── scripts/run-unit-tests.js         → Jest (jest.unit.config.js)
  ├── scripts/run-workflow-tests.js     → Jest (jest.workflow.config.js)
  ├── scripts/run-integration-tests.js  → Jest (jest.integration.config.js)
  ├── scripts/run-api-tests.js          → Jest (jest.api.config.js)
  ├── scripts/run-mcp-tools-tests.js    → Jest (jest.mcp-tools.config.js)
  └── scripts/run-e2e-tests.js          → Playwright (playwright.config.ts)
        │
        ├── scripts/detect-test-env.js          ← Shared: CLI --env parsing
        ├── scripts/parse-jest-results.js       ← Shared: Jest JSON → summary + failures
        └── scripts/parse-playwright-results.js ← Shared: Playwright JSON → summary + failures
```

### Common Patterns Across All Runners

Every `run-*.js` runner follows this pattern:

1. **Artifact cleanup** — Remove previous `{category}.json`, `{category}.log`, `failures/{category}/` for this category only (preserves other suites' results)
2. **Test file resolution** — If a bare filename is passed (not starting with `tests/`), glob-search `tests/{category}/**/{filename}` and resolve to full path
3. **Spawn test framework** — `npx jest ...` or `npx playwright test ...` with `stdio: ["inherit", "pipe", "pipe"]`
4. **Capture output** — Accumulate stdout + stderr in memory
5. **Write log** — On process close, write combined output to `test-results/artifacts/{category}.log`
6. **Invoke parser** — Spawn `parse-jest-results.js` or `parse-playwright-results.js` with result file, log file, and failures dir
7. **Exit code** — Propagate `max(framework_exit_code, parser_exit_code)`

---

## 1. detect-test-env.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/detect-test-env.js`

**Purpose:** Parse CLI arguments to extract the `--env` flag value and an optional test file path. Provides a shared utility used by all environment-aware runners (API, MCP Tools, E2E).

### Exported Functions

#### `detectTestEnv(args)`

```javascript
export function detectTestEnv(args: string[]): {
  testEnv: string,       // "local" (default), "staging", "prod", "remote"
  testFile: string|null, // First non-flag argument, or null
  envExplicit: boolean   // true if --env was explicitly provided
}
```

**Purpose:** Iterate over CLI args array, extract `--env <value>` and the first positional argument as `testFile`.

**Implementation details:**
- Iterates with index-based loop; when `args[i] === "--env"`, consumes `args[i+1]` as value and sets `envExplicit = true`
- Any argument not starting with `-` is treated as `testFile`
- Default `testEnv` is `"local"`
- No validation of env values (validation is done by callers)

### Internal Functions

None.

### CLI Arguments

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--env` | `local`, `staging`, `prod`, `remote` | `local` | Environment selector |
| `<positional>` | any string | `null` | Test file path/name |

### Output Files

None.

### External Dependencies

None (pure JavaScript, no imports).

### Integration Points

- **Imported by:** `run-api-tests.js`, `run-mcp-tools-tests.js`, `run-e2e-tests.js`

---

## 2. parse-jest-results.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/parse-jest-results.js`

**Purpose:** Parse a Jest JSON result file, print a summary to console, generate individual markdown failure reports, and write a timing statistics file. CLI entry point (not imported, invoked via `node`).

### CLI Invocation

```
node parse-jest-results.js <result-file> <log-file> [failures-dir]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `result-file` | Yes | Path to Jest `--json --outputFile` result (e.g. `api.json`) |
| `log-file` | Yes | Path to combined stdout+stderr log |
| `failures-dir` | No | Directory for individual failure `.md` reports |

### Internal Functions

#### `stripAnsi(text)`

```javascript
function stripAnsi(text: string): string
```

Removes ANSI escape codes (`\x1b[...m`) from text.

#### `sanitizeFilename(name)`

```javascript
function sanitizeFilename(name: string): string
```

Converts a test name into a safe filename: strips non-word characters, replaces spaces with hyphens, lowercases, truncates to 100 chars.

### Main Logic (top-level try/catch)

1. **Parse JSON** — `JSON.parse(readFileSync(resultFile))`
2. **Extract stats:**
   - `passed` = `data.numPassedTests`
   - `failed` = `data.numFailedTests`
   - `skipped` = `data.numPendingTests`
   - `total` = `data.numTotalTests`
   - `time` = first test result's `perfStats.runtime / 1000`
3. **Framework crash detection** — If `total === 0` and log file exists, scan for error patterns (`Error:`, `ReferenceError`, `SyntaxError`, `TypeError`, `Timed out`, `ECONNREFUSED`, `failed to run`). Show error snippet (2 lines before, 10 lines after first match).
4. **Failure reports** — For each failed assertion in each failed suite:
   - Print `• {testName}` and `{fileName}` to console
   - If `failuresDir` provided, write `{NN}-{sanitized-name}.md` with:
     - Test name, file, status
     - Error details (ANSI-stripped `failureMessages`)
5. **Timing statistics** — Collect per-test and per-suite timings:
   - `testTimings[]`: `{title, file, duration, status}` from `assertionResults[].duration`
   - `suiteTimings[]`: `{file, totalDuration, testDuration, setupTeardownDuration, testCount}` computed as `(endTime - startTime) - sum(test.duration)`
   - Sort both by duration descending
   - Write `{categoryName}-timing.txt` to same directory as result file
   - Contents: header, top 30 slowest tests, top 15 suites by setup/teardown time
6. **Coverage check** — If `coverage/` dir exists next to result file and has `.md` files and there are failures, print hint to read coverage reports
7. **Exit code** — `1` if any failures, `0` otherwise

### Output Files

| File | Format | Description |
|------|--------|-------------|
| `{failures-dir}/{NN}-{name}.md` | Markdown | Individual failure report per failed test |
| `{result-dir}/{category}-timing.txt` | Plain text | Top 30 slowest tests + top 15 suites by setup/teardown |

### External Dependencies

| Package | Usage |
|---------|-------|
| `fs` (node) | `readFileSync`, `existsSync`, `writeFileSync`, `mkdirSync`, `readdirSync` |
| `path` (node) | `dirname`, `basename`, `join` |

### Integration Points

- **Invoked by:** All Jest-based runners (`run-unit-tests.js`, `run-integration-tests.js`, `run-workflow-tests.js`, `run-api-tests.js`, `run-mcp-tools-tests.js`)

---

## 3. parse-playwright-results.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/parse-playwright-results.js`

**Purpose:** Parse a Playwright JSON result file, print a summary, generate individual markdown failure reports, and write timing statistics. CLI entry point.

### CLI Invocation

```
node parse-playwright-results.js <result-file> <log-file> [failures-dir]
```

Same argument structure as `parse-jest-results.js`.

### Internal Functions

#### `stripAnsi(text)`

```javascript
function stripAnsi(text: string): string
```

Identical to Jest parser's implementation.

#### `sanitizeFilename(name)`

```javascript
function sanitizeFilename(name: string): string
```

Identical to Jest parser's implementation.

#### `collectFailures(suites)`

```javascript
function collectFailures(suites: PlaywrightSuite[]): void  // closure over failureFiles, failureIndex
```

Recursively walks Playwright's nested suite structure (`suites[].specs[].tests[].results[]`). For each failed spec (`spec.ok === false`), processes only the **last result** (final attempt after retries). Generates markdown reports including:

- Test name, file, status, duration
- Error section (from `result.error` and `result.errors[]`)
- STDOUT section (from `result.stdout[]`)
- STDERR section (from `result.stderr[]`)
- Attachments section (from `result.attachments[]`)

#### `collectTimings(suites)`

```javascript
function collectTimings(suites: PlaywrightSuite[]): void  // closure over testTimings
```

Recursively collects `{title, file, duration, status}` from the last result of each test in each spec.

### Main Logic (top-level try/catch)

1. **Parse JSON** — `JSON.parse(readFileSync(resultFile))`
2. **Extract stats:**
   - `passed` = `data.stats.expected`
   - `failed` = `data.stats.unexpected`
   - `skipped` = `data.stats.skipped`
   - `time` = `data.stats.duration / 1000`
3. **Framework crash detection** — Same pattern as Jest parser, with additional `"globalSetup"` error pattern
4. **Failure reports** — Via recursive `collectFailures(data.suites)`
5. **Timing statistics** — Via recursive `collectTimings(data.suites)`:
   - Sorted by duration descending
   - Written to `{stats-dir}/e2e-timing.txt` (hardcoded filename, not derived from category)
   - Contents: header, top 30 slowest tests
   - No suite-level setup/teardown analysis (unlike Jest parser)
6. **Exit code** — `1` if any failures, `0` otherwise

### Output Files

| File | Format | Description |
|------|--------|-------------|
| `{failures-dir}/{NN}-{name}.md` | Markdown | Individual failure report with error, stdout, stderr, attachments |
| `{stats-dir}/e2e-timing.txt` | Plain text | Top 30 slowest tests (hardcoded filename) |

### External Dependencies

| Package | Usage |
|---------|-------|
| `fs` (node) | `readFileSync`, `existsSync`, `writeFileSync`, `mkdirSync` |
| `path` (node) | `join`, `dirname` |

### Integration Points

- **Invoked by:** `run-e2e-tests.js`

### Key Differences from Jest Parser

| Aspect | Jest Parser | Playwright Parser |
|--------|-------------|-------------------|
| Stats source | `data.numPassedTests`, etc. | `data.stats.expected`, etc. |
| Suite structure | Flat `data.testResults[]` | Nested `data.suites[].suites[].specs[]` |
| Retry handling | N/A | Only last attempt (`results[results.length-1]`) |
| Failure report | Error details only | Error + stdout + stderr + attachments |
| Timing file name | `{category}-timing.txt` (derived) | `e2e-timing.txt` (hardcoded) |
| Suite timing | Yes (setup/teardown analysis) | No |
| Coverage check | Yes | No |

---

## 4. run-unit-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/run-unit-tests.js`

**Purpose:** Run Jest unit tests with artifact management, test file resolution, and result parsing. Simplest runner — no environment routing.

### CLI Invocation

```
node run-unit-tests.js [test-file.test.ts]
```

Via npm: `npm run test:unit [-- test-file.test.ts]`

### Configuration

| Property | Value |
|----------|-------|
| Jest config | `tests/config/jest.unit.config.js` |
| Test directory | `tests/unit/` |
| Result file | `test-results/artifacts/unit.json` |
| Log file | `test-results/artifacts/unit.log` |
| Failures dir | `test-results/artifacts/failures/unit` |
| Parser | `parse-jest-results.js` |

### Environment Variables Set

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `"test"` |
| `NODE_OPTIONS` | `"--experimental-vm-modules"` |

### CLI Arguments

| Argument | Description |
|----------|-------------|
| `<positional>` | Optional test file name/path. If bare name, resolved via `glob tests/unit/**/{name}` |

### Output Files

| File | Description |
|------|-------------|
| `test-results/artifacts/unit.json` | Jest JSON output |
| `test-results/artifacts/unit.log` | Combined stdout+stderr |
| `test-results/artifacts/failures/unit/*.md` | Per-failure reports (via parser) |
| `test-results/artifacts/unit-timing.txt` | Timing stats (via parser) |

### External Dependencies

| Package | Usage |
|---------|-------|
| `dotenv` | Load `.env.local` |
| `child_process` (node) | `spawn` |
| `fs` (node) | `mkdirSync`, `existsSync`, `rmSync`, `writeFileSync` |
| `path` (node) | `fileURLToPath`, `dirname`, `join` |
| `glob` | Dynamic import for `globSync` (test file resolution) |

### Integration Points

- **Imports:** None from other scripts (loads `.env.local` directly)
- **Invokes:** `parse-jest-results.js` (spawned as child process)
- **Called by:** `run-all-tests.js` via `npm run test:unit`

---

## 5. run-integration-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/run-integration-tests.js`

**Purpose:** Run Jest integration tests with a dedicated test database path and encryption key. No environment routing.

### CLI Invocation

```
node run-integration-tests.js [test-file.test.ts]
```

Via npm: `npm run test:integration [-- test-file.test.ts]`

### Configuration

| Property | Value |
|----------|-------|
| Jest config | `tests/config/jest.integration.config.js` |
| Test directory | `tests/integration/` |
| Result file | `test-results/artifacts/integration.json` |
| Log file | `test-results/artifacts/integration.log` |
| Failures dir | `test-results/artifacts/failures/integration` |
| Parser | `parse-jest-results.js` |

### Environment Variables Set

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `"test"` |
| `NODE_OPTIONS` | `"--experimental-vm-modules"` |
| `DB_PATH` | `"./data/test-integration.db"` |
| `TELEGRAM_ENCRYPTION_KEY` | Hardcoded 64-char hex string: `"a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"` |

### CLI Arguments

| Argument | Description |
|----------|-------------|
| `<positional>` | Optional test file. Resolved via `glob tests/integration/**/{name}` |

### Output Files

Same pattern as unit: `integration.json`, `integration.log`, `failures/integration/*.md`, `integration-timing.txt`

### External Dependencies

Same as unit runner: `dotenv`, `child_process`, `fs`, `path`, `glob`.

### Integration Points

- **Imports:** None from other scripts
- **Invokes:** `parse-jest-results.js`
- **Called by:** `run-all-tests.js` via `npm run test:integration`

---

## 6. run-workflow-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/run-workflow-tests.js`

**Purpose:** Run Jest workflow scenario tests. No environment routing. Structurally identical to `run-unit-tests.js` but targets `tests/workflow/`.

### CLI Invocation

```
node run-workflow-tests.js [test-file.test.ts]
```

Via npm: `npm run test:workflow [-- test-file.test.ts]`

### Configuration

| Property | Value |
|----------|-------|
| Jest config | `tests/config/jest.workflow.config.js` |
| Test directory | `tests/workflow/` |
| Result file | `test-results/artifacts/workflow.json` |
| Log file | `test-results/artifacts/workflow.log` |
| Failures dir | `test-results/artifacts/failures/workflow` |
| Parser | `parse-jest-results.js` |

### Environment Variables Set

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `"test"` |
| `NODE_OPTIONS` | `"--experimental-vm-modules"` |

### CLI Arguments

| Argument | Description |
|----------|-------------|
| `<positional>` | Optional test file. Resolved via `glob tests/workflow/**/{name}` |

### Output Files

Same pattern: `workflow.json`, `workflow.log`, `failures/workflow/*.md`, `workflow-timing.txt`

### External Dependencies

Same as unit runner.

### Integration Points

- **Imports:** None from other scripts
- **Invokes:** `parse-jest-results.js`
- **Called by:** `run-all-tests.js` via `npm run test:workflow`

---

## 7. run-api-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/run-api-tests.js`

**Purpose:** Run Jest API tests against configurable environments (local Docker, remote Docker, staging, production). Supports multi-environment routing with `.env` file loading.

### CLI Invocation

```
node run-api-tests.js [--env local|remote|staging|prod] [test-file.test.ts]
```

Via npm: `npm run test:api`, `npm run test:api:staging`, `npm run test:api:prod`

### Environment Configuration (`ENV_CONFIG`)

| Environment | Env File | URL Resolution |
|-------------|----------|----------------|
| `local` | `.env.local` | `http://localhost:{DOCKER_PORT}` |
| `remote` | `.env.local` + `.env.remote` | `http://{REMOTE_HOST}:{DOCKER_PORT}` |
| `staging` | `.env.staging.witqq` | `https://moira.witqq.ru` (hardcoded) |
| `prod` | `.env.production.moiraqq` | `https://{MOIRA_HOST}` |

### Configuration

| Property | Value |
|----------|-------|
| Jest config | `tests/config/jest.api.config.js` |
| Test directory | `tests/api/` |
| Result file | `test-results/artifacts/api.json` |
| Log file | `test-results/artifacts/api.log` |
| Failures dir | `test-results/artifacts/failures/api` |
| Parser | `parse-jest-results.js` |

### Environment Variables Set

| Variable | Value |
|----------|-------|
| `NODE_OPTIONS` | `"--experimental-vm-modules"` |
| `TEST_BASE_URL` | Resolved from `ENV_CONFIG` |

### CLI Arguments

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--env` | `local`, `remote`, `staging`, `prod` | `local` | Environment selector |
| `<positional>` | test file | none | Resolved via `glob tests/api/**/{name}` |

### Key Implementation Details

- **Remote mode fail-fast:** Checks `.env.remote` exists before proceeding; exits with error if missing
- **Extra env file:** Remote mode loads both `.env.local` and `.env.remote` (with `override: true`)
- **URL construction:** Local appends `DOCKER_PORT`; remote uses `REMOTE_HOST:DOCKER_PORT`; prod extracts `MOIRA_HOST`

### Output Files

Same pattern: `api.json`, `api.log`, `failures/api/*.md`, `api-timing.txt`

### External Dependencies

| Package | Usage |
|---------|-------|
| `dotenv` | Load env files with optional override |
| `child_process` (node) | `spawn` |
| `fs` (node) | `readFileSync`, `mkdirSync`, `existsSync`, `rmSync`, `writeFileSync` |
| `path` (node) | `fileURLToPath`, `dirname`, `join` |
| `glob` | Dynamic import for `globSync` |

### Integration Points

- **Imports:** `detectTestEnv` from `./detect-test-env.js`
- **Invokes:** `parse-jest-results.js`
- **Called by:** `run-all-tests.js` via `npm run test:api`

---

## 8. run-mcp-tools-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/run-mcp-tools-tests.js`

**Purpose:** Run Jest MCP Tools tests against configurable environments. Nearly identical to `run-api-tests.js` but targets the `/mcp` endpoint and sets `MCP_SERVER_URL`.

### CLI Invocation

```
node run-mcp-tools-tests.js [--env local|remote|staging|prod] [test-file.test.ts]
```

Via npm: `npm run test:mcp-tools`, `npm run test:mcp-tools:staging`, `npm run test:mcp-tools:prod`

### Environment Configuration (`ENV_CONFIG`)

| Environment | Env File | URL Resolution |
|-------------|----------|----------------|
| `local` | `.env.local` | `http://localhost:{DOCKER_PORT}/mcp` |
| `remote` | `.env.local` + `.env.remote` | `http://{REMOTE_HOST}:{DOCKER_PORT}/mcp` |
| `staging` | `.env.staging.witqq` | `https://moira.witqq.ru/mcp` (hardcoded) |
| `prod` | `.env.production.moiraqq` | `https://{MOIRA_HOST}/mcp` |

### Configuration

| Property | Value |
|----------|-------|
| Jest config | `tests/config/jest.mcp-tools.config.js` |
| Test directory | `tests/mcp-tools/` |
| Result file | `test-results/artifacts/mcp-tools.json` |
| Log file | `test-results/artifacts/mcp-tools.log` |
| Failures dir | `test-results/artifacts/failures/mcp-tools` |
| Parser | `parse-jest-results.js` |

### Environment Variables Set

| Variable | Value |
|----------|-------|
| `NODE_OPTIONS` | `"--experimental-vm-modules"` |
| `MCP_SERVER_URL` | Resolved URL with `/mcp` suffix |
| `TEST_BASE_URL` | `MCP_SERVER_URL` with `/mcp` stripped |

### Key Difference from API Runner

- All URLs include `/mcp` path suffix
- Sets both `MCP_SERVER_URL` and `TEST_BASE_URL` (derived by stripping `/mcp`)

### CLI Arguments

Same as `run-api-tests.js`.

### Output Files

Same pattern: `mcp-tools.json`, `mcp-tools.log`, `failures/mcp-tools/*.md`, `mcp-tools-timing.txt`

### External Dependencies

Same as `run-api-tests.js`.

### Integration Points

- **Imports:** `detectTestEnv` from `./detect-test-env.js`
- **Invokes:** `parse-jest-results.js`
- **Called by:** `run-all-tests.js` via `npm run test:mcp-tools`

---

## 9. run-e2e-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/run-e2e-tests.js`

**Purpose:** Run Playwright E2E tests against configurable environments. Only runner using Playwright instead of Jest. Supports `--headed` mode for visual debugging.

### CLI Invocation

```
node run-e2e-tests.js [--env local|remote|staging|prod] [--headed] [test-file.spec.ts]
```

Via npm: `npm run test:e2e`, `npm run test:e2e:staging`, `npm run test:e2e:prod`

### Environment Configuration (`ENV_CONFIG`)

| Environment | Env File | URL Resolution |
|-------------|----------|----------------|
| `local` | `.env.local` | `http://localhost:{DOCKER_PORT}` |
| `remote` | `.env.local` + `.env.remote` | `http://localhost:{DOCKER_PORT}` (browser uses localhost) |
| `staging` | `.env.staging.witqq` | `https://moira.witqq.ru` (hardcoded) |
| `prod` | `.env.production.moiraqq` | `https://{MOIRA_HOST}` |

### Configuration

| Property | Value |
|----------|-------|
| Playwright config | `tests/config/playwright.config.ts` |
| Test directory | `tests/e2e/` |
| Result file | `test-results/artifacts/e2e.json` |
| Log file | `test-results/artifacts/e2e.log` |
| Failures dir | `test-results/artifacts/failures/e2e` |
| Parser | `parse-playwright-results.js` |

### Environment Variables Set

| Variable | Value |
|----------|-------|
| `TEST_BASE_URL` | Resolved from `ENV_CONFIG` |

(No `NODE_OPTIONS` — Playwright doesn't need `--experimental-vm-modules`)

### CLI Arguments

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--env` | `local`, `remote`, `staging`, `prod` | `local` | Environment selector |
| `--headed` | (flag) | off | Run browser in headed mode |
| `<positional>` | test file | none | Resolved via `glob tests/e2e/**/{name}` |

### Key Differences from Jest Runners

- **`--headed` flag:** Stripped from args before passing to `detectTestEnv`, then passed to Playwright as `--headed`
- **Remote mode URL:** Uses `localhost` (browser runs on same machine as Docker), not `REMOTE_HOST`
- **Spawn command:** `npx playwright test --config=...` instead of `npx jest --config=...`
- **Parser:** `parse-playwright-results.js` instead of `parse-jest-results.js`

### Output Files

| File | Description |
|------|-------------|
| `test-results/artifacts/e2e.json` | Playwright JSON output |
| `test-results/artifacts/e2e.log` | Combined stdout+stderr |
| `test-results/artifacts/failures/e2e/*.md` | Per-failure reports (via parser) |
| `test-results/artifacts/e2e-timing.txt` | Timing stats (via parser) |

### External Dependencies

Same as `run-api-tests.js`.

### Integration Points

- **Imports:** `detectTestEnv` from `./detect-test-env.js`
- **Invokes:** `parse-playwright-results.js`
- **Called by:** `run-all-tests.js` via `npm run test:e2e`

---

## 10. run-all-tests.js

**Full path:** `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/run-all-tests.js`

**Purpose:** Orchestrate all 6 test suites in parallel, collect results, generate a unified summary report with colored table, and provide agent-friendly failure instructions.

### CLI Invocation

```
node tests/run-all-tests.js [--env local|remote|staging|prod] [-- test-file]
```

Via npm: `npm test`, `npm run test:local`, `npm run test:staging`, etc.

### Internal Functions

#### `stripAnsi(text)`

```javascript
function stripAnsi(text: string): string
```

Removes ANSI escape codes. Same as parsers.

#### `log(message)`

```javascript
function log(message?: string): void
```

Dual-output: prints to `console.log` AND appends to `logOutput[]` array for later file write.

#### `showErrorSnippet(logFile)`

```javascript
function showErrorSnippet(logFile: string): void
```

Reads a log file and searches for error patterns (`Error:`, `ReferenceError`, `SyntaxError`, `TypeError`, `Timed out`, `ECONNREFUSED`, `failed to run`). If found, prints the log file path and an error snippet (2 lines before, 8 lines after first match).

#### `parseJestReport(file)`

```javascript
function parseJestReport(file: string): {
  passed: number,
  failed: number,
  skipped: number,
  time: string,      // e.g. "1.234 s"
  success: boolean
}
```

Parses Jest JSON output. Calculates total time by summing `(endTime - startTime)` across all `testResults[]` entries. Falls back to zeros on parse error.

#### `parsePlaywrightReport(file)`

```javascript
function parsePlaywrightReport(file: string): {
  passed: number,
  failed: number,
  skipped: number,
  time: string,
  success: boolean
}
```

Parses Playwright JSON output via `data.stats`. Success = `unexpected === 0`.

#### `formatNumber(num, color)`

```javascript
function formatNumber(num: number, color: string): string
```

Right-pads number to 8 chars with ANSI color. Shows `"       0"` without color when `num === 0`.

#### `cleanup()`

```javascript
function cleanup(): void
```

Deletes all result JSON files. **Note: defined but never called** in the current code.

#### `runTestSuiteAsync(suite, index, total)`

```javascript
async function runTestSuiteAsync(suite: SuiteConfig, index: number, total: number): Promise<{
  name: string,
  passed: number,
  failed: number,
  skipped: number,
  time: string,
  success: boolean
}>
```

Core runner function:
1. Logs `[{index}/{total}] Running {name} Tests...`
2. Spawns suite command via `spawn(cmd, args, { shell: true })` with piped stdio
3. Captures stdout/stderr
4. On close: writes output to `suite.logFile`, parses result file
5. **Zero-test handling:**
   - If `testFileArg` was provided → mark as skipped (not an error)
   - If no filter → mark as failed (framework crash)
6. Returns result object

### Main Flow (top-level await)

1. Load `.env.local`, validate `DOCKER_PORT` exists
2. Parse `--env` and test file from CLI args
3. Define 6 test suites:

| Suite | npm command | Type | Result file |
|-------|------------|------|-------------|
| Unit | `npm run test:unit` | jest | `unit.json` |
| Workflow | `npm run test:workflow` | jest | `workflow.json` |
| Integration | `npm run test:integration` | jest | `integration.json` |
| API | `npm run test:api` | jest | `api.json` |
| MCP Tools | `npm run test:mcp-tools` | jest | `mcp-tools.json` |
| E2E (Playwright) | `npm run test:e2e` | playwright | `e2e.json` |

4. Run ALL suites in parallel via `Promise.all()`
5. Calculate totals (passed, failed, skipped)
6. Print formatted summary table with colors
7. If failures: print failure section with paths to `.md` reports and agent instructions box
8. Print artifact index table
9. Write `test-results/test-summary.log` (ANSI-stripped)
10. Exit with code 1 if any failures

### CLI Arguments

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--env` | `local`, `remote`, `staging`, `prod` | none | Passed through to suite runners |
| `--` | separator | — | Separator before test file |
| `<positional>` | test file | none | Passed to all runners (each resolves in its own dir) |

### Output Files

| File | Format | Description |
|------|--------|-------------|
| `test-results/test-summary.log` | Plain text | ANSI-stripped full console output |

All other artifacts are created by individual runners and their parsers.

### External Dependencies

| Package | Usage |
|---------|-------|
| `dotenv` | Load `.env.local` |
| `child_process` (node) | `execSync` (imported but unused), `spawn` |
| `fs` (node) | `readFileSync`, `writeFileSync`, `unlinkSync`, `existsSync`, `mkdirSync`, `readdirSync` |
| `path` (node) | `dirname`, `resolve`, `fileURLToPath` |

### Integration Points

- **Imports:** None from `scripts/` (uses `npm run` commands)
- **Invokes (indirectly):** All 6 runner scripts via npm
- **Called by:** `npm test` / `npm run test:all`

---

## Cross-Reference: Runner Comparison Matrix

| Feature | unit | workflow | integration | api | mcp-tools | e2e |
|---------|------|----------|-------------|-----|-----------|-----|
| Framework | Jest | Jest | Jest | Jest | Jest | Playwright |
| Env routing | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| `detectTestEnv` | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| `--headed` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `.env` file | `.env.local` | `.env.local` | `.env.local` | per-env | per-env | per-env |
| `NODE_ENV=test` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `NODE_OPTIONS` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Custom env vars | — | — | `DB_PATH`, `TELEGRAM_ENCRYPTION_KEY` | `TEST_BASE_URL` | `MCP_SERVER_URL`, `TEST_BASE_URL` | `TEST_BASE_URL` |
| Parser | jest | jest | jest | jest | jest | playwright |
| Test dir | `tests/unit/` | `tests/workflow/` | `tests/integration/` | `tests/api/` | `tests/mcp-tools/` | `tests/e2e/` |

---

## Artifact Directory Structure

```
test-results/
├── test-summary.log                  ← From run-all-tests.js
└── artifacts/
    ├── unit.json                     ← Jest JSON output
    ├── unit.log                      ← Combined stdout+stderr
    ├── unit-timing.txt               ← Timing stats (from parser)
    ├── workflow.json
    ├── workflow.log
    ├── workflow-timing.txt
    ├── integration.json
    ├── integration.log
    ├── integration-timing.txt
    ├── api.json
    ├── api.log
    ├── api-timing.txt
    ├── mcp-tools.json
    ├── mcp-tools.log
    ├── mcp-tools-timing.txt
    ├── e2e.json
    ├── e2e.log
    ├── e2e-timing.txt                ← Hardcoded filename (not derived)
    └── failures/
        ├── unit/
        │   ├── 01-test-name.md
        │   └── ...
        ├── workflow/
        ├── integration/
        ├── api/
        ├── mcp-tools/
        └── e2e/
```
