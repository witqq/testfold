> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# Moira → testfold Migration Mapping

> Function-by-function mapping of MCP Moira test runner scripts to testfold equivalents.
> Based on `moira-catalog.md` and `testfold-capabilities.md`.

**Status legend:**
- ✅ DIRECT — exact equivalent exists in testfold
- 🔄 PARTIAL — similar but not identical
- ⚙️ CONFIG — handled via testfold config, not code
- 🔌 HOOK — achievable via hooks system
- ❌ GAP — no equivalent, needs custom code or testfold enhancement

---

## 1. File-by-File Mapping Tables

### 1.1 detect-test-env.js

Shared utility for CLI `--env` parsing and test file extraction.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `detectTestEnv(args)` — parse `--env <value>` | `parseArgs()` in `src/cli/args.ts` (`--env` / `-e` flag) | ✅ DIRECT | testfold parses `--env` natively |
| `detectTestEnv(args)` — extract positional `testFile` | Pass-through args after `--` + `resolvePathPrefix()` | ✅ DIRECT | testfold resolves prefixes to full paths automatically |
| `envExplicit` boolean flag | Not tracked; env is `undefined` if not provided | 🔄 PARTIAL | Callers in Moira use `envExplicit` for validation; in testfold, absence of `--env` means no environment routing |
| Default `testEnv = "local"` | No default env; if `-e` not given, no env routing occurs | 🔄 PARTIAL | Moira defaults to `local`; testfold requires explicit `-e local`. Can set default in config via suite `env` |

### 1.2 parse-jest-results.js

Jest JSON parser invoked as CLI subprocess by all Jest runners.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `stripAnsi(text)` | `stripAnsi()` in `src/utils/ansi.ts` | ✅ DIRECT | Same regex pattern |
| `sanitizeFilename(name)` | `sanitizeFilename()` in `src/utils/sanitize.ts` | ✅ DIRECT | Same pipeline: lowercase → strip special → hyphens → truncate 100 |
| JSON parsing (`data.numPassedTests`, etc.) | `JestParser.parse()` in `src/parsers/jest.ts` | ✅ DIRECT | Same fields extracted |
| Framework crash detection (scan log for error patterns) | `JestParser` — same error patterns: `Error:`, `ReferenceError`, `SyntaxError`, `TypeError`, `Timed out`, `ECONNREFUSED`, `Cannot find module` | ✅ DIRECT | testfold adds `failed to run` pattern |
| Error snippet extraction (±2/+10 context lines) | `JestParser` — error snippet from log (±2/+10 lines) | ✅ DIRECT | Same context window |
| Test suite crash detection (`status === 'failed'`, empty `assertionResults`) | `JestParser` — handles crashed suites | ✅ DIRECT | |
| Test hierarchy (`ancestorTitles + title` → `>` joined) | `JestParser` — builds from `ancestorTitles + title` | ✅ DIRECT | |
| Pending/skipped mapping | `JestParser` — Jest `pending` → `skipped` | ✅ DIRECT | |
| Failure report generation (`.md` per test) | `MarkdownReporter` in `src/reporters/markdown.ts` | ✅ DIRECT | Same format: hierarchy, file, error, stack |
| Timing: per-test `{title, file, duration, status}` | `TimingReporter` + `TimingTextReporter` — collects `testResults[]` with same fields | ✅ DIRECT | |
| Timing: per-suite setup/teardown analysis (`endTime - startTime - sum(test.duration)`) | `TimingTextReporter` — calculates "Setup/Teardown Overhead" | ✅ DIRECT | |
| Timing: write `{category}-timing.txt` with top 30 tests + top 15 suites | `TimingTextReporter` — writes `{suite-name}-timing.txt` with top 30 tests + top 15 files | ✅ DIRECT | Moira: "top 15 suites by setup/teardown"; testfold: "top 15 files by test duration" + overhead section |
| Coverage check: detect `coverage/` dir, print hint | — | ❌ GAP | testfold has no coverage report detection |
| Console summary: print pass/fail/skip/time | `ConsoleReporter` in `src/reporters/console.ts` | ✅ DIRECT | |
| CLI entry point (`node parse-jest-results.js <args>`) | Internal: `JestParser` called by `Orchestrator` automatically | ⚙️ CONFIG | No separate CLI invocation needed; parser is selected by suite `type: 'jest'` |

### 1.3 parse-playwright-results.js

Playwright JSON parser invoked as CLI subprocess by E2E runner.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `stripAnsi(text)` | `stripAnsi()` in `src/utils/ansi.ts` | ✅ DIRECT | |
| `sanitizeFilename(name)` | `sanitizeFilename()` in `src/utils/sanitize.ts` | ✅ DIRECT | |
| JSON parsing (`data.stats.expected/unexpected/skipped`) | `PlaywrightParser.parse()` in `src/parsers/playwright.ts` | ✅ DIRECT | Same stats mapping |
| `collectFailures(suites)` — recursive nested suite traversal | `PlaywrightParser.collectResults()` — recursive traversal | ✅ DIRECT | Same recursive approach |
| `collectTimings(suites)` — recursive timing collection | `PlaywrightParser` produces `testResults[]` for `TimingReporter` | ✅ DIRECT | |
| Retry handling: only last result | `PlaywrightParser` — takes last `test.results` entry | ✅ DIRECT | |
| Framework crash detection with `globalSetup` pattern | `PlaywrightParser` — same patterns + `globalSetup` | ✅ DIRECT | |
| Corrupted JSON fallback to log-based detection | `PlaywrightParser` — falls back to crash detection, returns `Result Parse Error` | ✅ DIRECT | |
| Rich failure details: stdout, stderr, attachments | `PlaywrightParser` captures all + `MarkdownReporter` renders them | ✅ DIRECT | testfold also captures attachments across all retry attempts |
| Failure reports (`.md` per test with error/stdout/stderr/attachments) | `MarkdownReporter` — sections for Error, Stack, Stdout, Stderr, Attachments | ✅ DIRECT | |
| Hardcoded timing filename `e2e-timing.txt` | `TimingTextReporter` — uses `{suite-name}-timing.txt` (derived) | 🔄 PARTIAL | testfold derives name from suite config; same result if suite named `e2e` |
| No suite-level setup/teardown analysis | `TimingTextReporter` — calculates overhead for all suites | 🔄 PARTIAL | testfold adds overhead calculation; Moira skipped it for Playwright |

### 1.4 run-unit-tests.js

Jest unit test runner. Simplest runner — no environment routing.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| Artifact cleanup (`unit.json`, `unit.log`, `failures/unit/`) | `cleanSuiteArtifacts()` in `src/utils/files.ts` — per-suite selective cleanup | ✅ DIRECT | Preserves other suites' artifacts |
| Test file resolution via `glob tests/unit/**/{name}` | `resolvePathPrefix()` in `src/utils/path-resolver.ts` | ✅ DIRECT | Auto-resolves prefixes to full paths |
| Spawn `npx jest --config=... --json --outputFile=...` | `executeCommand()` in `src/core/executor.ts` | ✅ DIRECT | Command from suite config `command` field |
| Capture stdout+stderr in memory | `executeCommand()` — captures both streams | ✅ DIRECT | 50MB buffer limit in testfold |
| Write combined output to `unit.log` | `executeCommand()` — writes log file with command, exit code, duration, output | ✅ DIRECT | testfold log includes metadata header |
| Invoke parser as subprocess (`node parse-jest-results.js ...`) | `Orchestrator` invokes `JestParser.parse()` internally | ⚙️ CONFIG | No subprocess; parser called in-process |
| Exit code = `max(framework, parser)` | `Orchestrator` requires successful process and parser completion | 🔄 PARTIAL | testfold preserves partial results but returns semantic failure for nonzero completion |
| `NODE_ENV=test` env var | Suite config `env: { NODE_ENV: 'test' }` | ⚙️ CONFIG | |
| `NODE_OPTIONS=--experimental-vm-modules` env var | Suite config `env: { NODE_OPTIONS: '--experimental-vm-modules' }` | ⚙️ CONFIG | |
| `.env.local` loading via `dotenv` | `loadEnvFile('local', cwd)` or suite `environments.local.envFile` | ⚙️ CONFIG | |

### 1.5 run-integration-tests.js

Jest integration runner with custom env vars. No environment routing.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| All features from run-unit-tests.js | (same mappings as §1.4) | ✅ DIRECT | |
| `DB_PATH="./data/test-integration.db"` env var | Suite config `env: { DB_PATH: './data/test-integration.db' }` | ⚙️ CONFIG | |
| `TELEGRAM_ENCRYPTION_KEY` hardcoded env var | Suite config `env: { TELEGRAM_ENCRYPTION_KEY: '...' }` | ⚙️ CONFIG | ⚠️ Security: consider using `.env` file instead of config |
| Test dir `tests/integration/` | Suite config `command` points to correct jest config | ⚙️ CONFIG | |

### 1.6 run-workflow-tests.js

Jest workflow runner. Structurally identical to unit runner.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| All features from run-unit-tests.js | (same mappings as §1.4) | ✅ DIRECT | |
| Test dir `tests/workflow/` | Suite config `command` points to correct jest config | ⚙️ CONFIG | |

### 1.7 run-api-tests.js

Jest API runner with multi-environment routing.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| All common runner features (artifact cleanup, spawn, capture, parse) | (same mappings as §1.4) | ✅ DIRECT | |
| `detectTestEnv` import for `--env` parsing | CLI `-e` flag parsed by `parseArgs()` | ✅ DIRECT | |
| `ENV_CONFIG` — per-environment configuration map | Suite `environments` config in `test-runner.config.ts` | ⚙️ CONFIG | Map env names to `{ baseUrl, envFile, env, urlExtractor }` |
| `local` env: load `.env.local`, construct `http://localhost:{DOCKER_PORT}` | `environments.local: { envFile: '.env.local', urlExtractor: (content) => ... }` | ⚙️ CONFIG | `urlExtractor` reads `DOCKER_PORT` from env file content |
| `remote` env: load `.env.local` + `.env.remote` (override) | `environments.remote: { envFile: '.env.remote', env: {...} }` | 🔄 PARTIAL | testfold loads one `envFile` per environment; dual-file loading requires `beforeSuite` hook or custom env merging |
| `remote` mode fail-fast: check `.env.remote` exists | `beforeSuite` hook with guard: `{ ok: false, error: '.env.remote not found' }` | 🔌 HOOK | |
| `staging` env: hardcoded URL `https://moira.witqq.ru` | `environments.staging: { baseUrl: 'https://moira.witqq.ru' }` | ⚙️ CONFIG | |
| `prod` env: load `.env.production.moiraqq`, extract `MOIRA_HOST` | `environments.prod: { envFile: '.env.production.moiraqq', urlExtractor: ... }` | ⚙️ CONFIG | |
| Set `TEST_BASE_URL` env var from resolved URL | `Orchestrator` auto-sets `TEST_BASE_URL` from `baseUrl` or `urlExtractor` | ✅ DIRECT | |
| `NODE_OPTIONS=--experimental-vm-modules` | Suite config `env` | ⚙️ CONFIG | |

### 1.8 run-mcp-tools-tests.js

Jest MCP Tools runner. Nearly identical to API runner but targets `/mcp` endpoint.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| All features from run-api-tests.js | (same mappings as §1.7) | ✅/⚙️ | |
| All URLs include `/mcp` path suffix | `urlExtractor` appends `/mcp` to base URL | ⚙️ CONFIG | |
| Sets `MCP_SERVER_URL` (with `/mcp`) | Suite config `env` + `urlExtractor` → custom env var | ⚙️ CONFIG | `urlExtractor` returns URL, then `env: { MCP_SERVER_URL: ... }` or `afterSuite` |
| Sets `TEST_BASE_URL` (without `/mcp`, derived) | `baseUrl` or `urlExtractor` that returns URL without `/mcp` | 🔄 PARTIAL | Moira sets both simultaneously; testfold auto-sets `TEST_BASE_URL` from `baseUrl`. For dual-var, use `urlExtractor` + explicit `env` |

### 1.9 run-e2e-tests.js

Playwright E2E runner with environment routing and `--headed` support.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| All common runner features (artifact cleanup, spawn, capture, parse) | (same as §1.4) | ✅ DIRECT | |
| `detectTestEnv` for `--env` parsing | CLI `-e` flag | ✅ DIRECT | |
| Environment routing (same 4 envs) | Suite `environments` config | ⚙️ CONFIG | |
| `--headed` flag: strip from own args, pass to Playwright | Pass-through args: `testfold e2e -- --headed` | 🔄 PARTIAL | Not a first-class flag; user passes via `--` separator |
| Playwright spawn: `npx playwright test --config=...` | Suite `command: 'npx playwright test --config=...'` | ⚙️ CONFIG | |
| Remote URL uses `localhost` (browser on same machine) | `environments.remote.urlExtractor` returns `localhost` URL | ⚙️ CONFIG | |
| Parser: `parse-playwright-results.js` | Suite `type: 'playwright'` → `PlaywrightParser` auto-selected | ⚙️ CONFIG | |
| No `NODE_OPTIONS` (Playwright doesn't need it) | Omit from suite `env` | ⚙️ CONFIG | |

### 1.10 run-all-tests.js

Orchestrator: runs all 6 suites in parallel, generates unified summary.

| Moira Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `stripAnsi(text)` | `stripAnsi()` in `src/utils/ansi.ts` | ✅ DIRECT | |
| `log(message)` — dual output (console + buffer for file) | `SummaryLogReporter` in `src/reporters/summary-log.ts` | ✅ DIRECT | testfold separates console (ConsoleReporter) and log (SummaryLogReporter) |
| `showErrorSnippet(logFile)` — scan log for error patterns | `JestParser` / `PlaywrightParser` — crash detection with error snippets | ✅ DIRECT | Integrated into parsers, not separate function |
| `parseJestReport(file)` — parse Jest JSON for summary | `JestParser.parse()` | ✅ DIRECT | |
| `parsePlaywrightReport(file)` — parse Playwright JSON for summary | `PlaywrightParser.parse()` | ✅ DIRECT | |
| `formatNumber(num, color)` — right-pad with ANSI color | `ConsoleReporter` — internal table formatting | ✅ DIRECT | |
| `cleanup()` — delete result JSONs (defined but never called) | `cleanSuiteArtifacts()` — cleans per-suite artifacts before run | 🔄 PARTIAL | Moira's was dead code; testfold cleans before run, not after |
| `runTestSuiteAsync(suite, index, total)` — spawn + capture + parse | `Orchestrator.executeSuite()` — spawn → capture → parse → report | ✅ DIRECT | |
| Zero-test handling: filter provided → skipped; no filter → crash | `Orchestrator` rejects zero executed assertions | 🔄 PARTIAL | testfold fails empty or skipped-only execution regardless of filter |
| Parallel execution via `Promise.all()` for all 6 suites | `Orchestrator` with `config.parallel = true` → `Promise.all()` | ✅ DIRECT | |
| Summary table (suite name, passed, failed, skipped, time) | `ConsoleReporter.onComplete()` — prints summary table | ✅ DIRECT | |
| Totals row + pass rate | `ConsoleReporter` — totals row + pass rate % | ✅ DIRECT | |
| Final status (✓ ALL TESTS PASSED / ✗ TESTS FAILED) | `ConsoleReporter` — same pass/fail banner | ✅ DIRECT | |
| Failure section with paths to `.md` reports | `ConsoleReporter` — shows first 3 failures with "+N more" | 🔄 PARTIAL | Moira lists all failure report paths; testfold shows abbreviated failures + artifact inventory |
| Agent-friendly failure instructions box | — | ❌ GAP | Moira prints structured box with instructions for AI agents on how to read failure reports |
| Artifact index table (list all generated files) | `ConsoleReporter.onComplete()` — artifact inventory section | ✅ DIRECT | |
| Write `test-results/test-summary.log` (ANSI-stripped) | `SummaryLogReporter` — writes `test-summary.log` (ANSI-stripped) | ✅ DIRECT | |
| Suite definitions (6 hardcoded suites) | `test-runner.config.ts` — declarative suite definitions | ⚙️ CONFIG | Suites defined in config file instead of hardcoded |
| `.env.local` loading + `DOCKER_PORT` validation | `loadEnvFile()` + `beforeAll` hook for validation | 🔌 HOOK | Port validation can be a `beforeAll` hook guard |
| `--env` pass-through to individual runners | `-e` flag → `Orchestrator` applies environment per suite | ✅ DIRECT | Single orchestrator handles all suites; no need to pass through to sub-processes |
| `--` separator for test file pass-through | `--` separator → `passThrough` args → `resolvePathPrefix()` | ✅ DIRECT | |

---

## 2. Feature-Level Summary

Consolidated table of all unique features/capabilities across Moira scripts.

| # | Feature | Moira Implementation | testfold Equivalent | Status |
|---|---------|---------------------|--------------------|----|
| 1 | **CLI `--env` parsing** | `detectTestEnv()` utility function | `parseArgs()` with `-e` flag | ✅ DIRECT |
| 2 | **Test file argument** | `detectTestEnv()` positional arg | Pass-through args after `--` | ✅ DIRECT |
| 3 | **Test file glob resolution** | `globSync('tests/{category}/**/{name}')` in each runner | `resolvePathPrefix()` recursive search in `testsDir` | ✅ DIRECT |
| 4 | **Jest JSON parsing** | `parse-jest-results.js` (standalone script) | `JestParser` class (in-process) | ✅ DIRECT |
| 5 | **Playwright JSON parsing** | `parse-playwright-results.js` (standalone script) | `PlaywrightParser` class (in-process) | ✅ DIRECT |
| 6 | **Framework crash detection** | Log scanning in both parsers | Same error patterns in both parsers | ✅ DIRECT |
| 7 | **Error snippet extraction** | ±2/+10 context lines from log | Same context window in parsers | ✅ DIRECT |
| 8 | **ANSI stripping** | `stripAnsi()` duplicated in 3 files | `stripAnsi()` single utility | ✅ DIRECT |
| 9 | **Filename sanitization** | `sanitizeFilename()` duplicated in 2 files | `sanitizeFilename()` single utility | ✅ DIRECT |
| 10 | **Markdown failure reports** | Parser writes `.md` files directly | `MarkdownReporter` (reporter pattern) | ✅ DIRECT |
| 11 | **Per-test timing stats** | Parser writes `{category}-timing.txt` | `TimingReporter` (JSON) + `TimingTextReporter` (text) | ✅ DIRECT |
| 12 | **Suite setup/teardown overhead** | Jest parser calculates `endTime - startTime - sum(tests)` | `TimingTextReporter` calculates same overhead | ✅ DIRECT |
| 13 | **Artifact cleanup (per-suite)** | Each runner removes own `.json`, `.log`, `failures/{category}/` | `cleanSuiteArtifacts()` — same per-suite selective cleanup | ✅ DIRECT |
| 14 | **Process spawning** | `child_process.spawn()` with `shell: true` | `executeCommand()` with `spawn()`, `shell: true`, `detached: true` | ✅ DIRECT |
| 15 | **stdout/stderr capture** | Stream accumulation in runner scripts | `executeCommand()` captures both (50MB limit) | ✅ DIRECT |
| 16 | **Log file writing** | Runner writes `{category}.log` | Executor writes log with metadata header | ✅ DIRECT |
| 17 | **Parallel suite execution** | `Promise.all()` in `run-all-tests.js` | `Orchestrator` with `parallel: true` | ✅ DIRECT |
| 18 | **Summary table (console)** | `run-all-tests.js` formatted table with ANSI colors | `ConsoleReporter.onComplete()` | ✅ DIRECT |
| 19 | **Summary log (file)** | `test-summary.log` (ANSI-stripped console capture) | `SummaryLogReporter` → `test-summary.log` | ✅ DIRECT |
| 20 | **Multi-environment routing** | `ENV_CONFIG` map in api/mcp-tools/e2e runners | Suite `environments` config with `baseUrl`/`envFile`/`urlExtractor` | ⚙️ CONFIG |
| 21 | **Env file loading** | `dotenv.config({ path: ... })` per runner | `loadEnvFile()` / `loadEnvFileFromPath()` with search patterns | ✅ DIRECT |
| 22 | **URL construction from env vars** | Custom logic per runner (DOCKER_PORT, REMOTE_HOST, etc.) | `urlExtractor` function in suite environment config | ⚙️ CONFIG |
| 23 | **`TEST_BASE_URL` setting** | Explicit `process.env.TEST_BASE_URL = url` | `Orchestrator` auto-sets from `baseUrl` or `urlExtractor` result | ✅ DIRECT |
| 24 | **Dual env var setting** (`MCP_SERVER_URL` + `TEST_BASE_URL`) | `run-mcp-tools-tests.js` sets both | `urlExtractor` + suite `env` config | ⚙️ CONFIG |
| 25 | **Static env vars** (`NODE_ENV`, `NODE_OPTIONS`, `DB_PATH`, etc.) | Hardcoded `process.env.X = ...` per runner | Suite config `env: { ... }` | ⚙️ CONFIG |
| 26 | **Remote mode file pre-check** | Check `.env.remote` exists, exit if missing | `beforeSuite` hook with guard `{ ok: false }` | 🔌 HOOK |
| 27 | **Remote dual env file loading** | `.env.local` + `.env.remote` with `override: true` | Single `envFile` per environment; dual-loading via hook | 🔄 PARTIAL |
| 28 | **`--headed` flag for Playwright** | First-class CLI flag, stripped and passed to Playwright | Pass-through: `testfold e2e -- --headed` | 🔄 PARTIAL |
| 29 | **`envExplicit` tracking** | `detectTestEnv` returns boolean | Not tracked; env is `undefined` when absent | 🔄 PARTIAL |
| 30 | **Zero-test: filter → skip vs no-filter → crash** | `run-all-tests.js` differentiates based on `testFileArg` | Zero executed assertions fail regardless of filter | 🔄 PARTIAL |
| 31 | **Graceful error recovery** | Parser exit code combined with framework exit code | Partial results remain available without hiding failed process completion | ✅ DIRECT |
| 32 | **Exit code propagation** | `max(framework_code, parser_code)` | Semantic exit: pass, assertion failure, infrastructure failure or timeout | 🔄 PARTIAL |
| 33 | **Suite type: Playwright** | `run-e2e-tests.js` spawns `npx playwright test` | Suite `type: 'playwright'` auto-selects parser | ✅ DIRECT |
| 34 | **Parser as CLI subprocess** | `node parse-jest-results.js <args>` spawned | In-process: parser called by orchestrator directly | ⚙️ CONFIG |
| 35 | **Coverage report detection** | `parse-jest-results.js` checks `coverage/` dir for `.md` files | — | ❌ GAP |
| 36 | **Agent-friendly failure instructions** | `run-all-tests.js` prints formatted box with AI agent instructions | — | ❌ GAP |
| 37 | **Retry handling (Playwright)** | Parser takes last result from `results[]` | `PlaywrightParser` — same behavior | ✅ DIRECT |
| 38 | **Rich Playwright failures** (stdout, stderr, attachments) | `parse-playwright-results.js` captures all | `PlaywrightParser` + `MarkdownReporter` capture all | ✅ DIRECT |
| 39 | **Timeout / process kill** | Not implemented in Moira runners | `executeCommand()` — timeout with SIGTERM → SIGKILL escalation | ✅ DIRECT (testfold exceeds) |
| 40 | **Fail-fast (stop on first failure)** | Not implemented in Moira (always runs all) | `Orchestrator` with `failFast: true` (sequential mode) | ✅ DIRECT (testfold exceeds) |
| 41 | **Hooks system** | Not in Moira | `beforeAll` / `afterAll` / `beforeSuite` / `afterSuite` with guards | ✅ DIRECT (testfold exceeds) |
| 42 | **Custom parsers** | Not in Moira | `type: 'custom'` with `parser` path | ✅ DIRECT (testfold exceeds) |
| 43 | **Custom reporters** | Not in Moira | File path in `reporters` array | ✅ DIRECT (testfold exceeds) |
| 44 | **JSON summary report** | Not a separate feature (inline in orchestrator) | `JsonReporter` → `summary.json` | ✅ DIRECT (testfold exceeds) |
| 45 | **Text reporter (CI-friendly)** | Not in Moira | `TextReporter` → `results.txt` | ✅ DIRECT (testfold exceeds) |
| 46 | **Grep/filter by test name** | Not in Moira | `--grep`, `--grep-invert`, `--file` flags | ✅ DIRECT (testfold exceeds) |
| 47 | **Workers configuration** | Not in Moira (uses framework defaults) | Suite `workers` field → `--maxWorkers`/`--workers` | ✅ DIRECT (testfold exceeds) |
| 48 | **Streaming output callback** | Not in Moira | `executeCommand()` `onOutput` callback | ✅ DIRECT (testfold exceeds) |

---

## 3. Gap Analysis

### ❌ GAP 1: Coverage Report Detection

**What it does:** In `parse-jest-results.js`, after parsing, checks if a `coverage/` directory exists alongside the result file and contains `.md` coverage reports. If failures exist, prints a hint: "Coverage reports available in coverage/ directory."

**Why testfold can't do it:** No reporter or parser in testfold inspects for external coverage artifacts. Parsers focus on test results; reporters focus on presenting parsed data.

**Suggested workaround:**
- **Option A (Hook):** Use `afterAll` hook to check `fs.existsSync('coverage/')` and print a hint. Requires ~5 lines of custom code.
- **Option B (Custom Reporter):** Write a small custom reporter that checks for coverage artifacts in `onComplete()`.
- **Option C (Enhancement):** Add a `coverageDir` option to `ConsoleReporter` that prints a hint when coverage artifacts exist.

**Migration impact:** Low. This is a cosmetic hint, not core functionality.

---

### ❌ GAP 2: Agent-Friendly Failure Instructions

**What it does:** In `run-all-tests.js`, when tests fail, prints a formatted instruction box targeted at AI agents (e.g., Claude). The box contains:
- Paths to failure report `.md` files
- Instructions on how to read and act on failures
- Structured format optimized for LLM consumption

**Why testfold can't do it:** `ConsoleReporter` shows abbreviated failure info and artifact inventory, but doesn't include agent-specific instructions. The concept of "agent-targeted output" isn't part of testfold's design.

**Suggested workaround:**
- **Option A (Custom Reporter):** Write an `AgentReporter` that generates agent-friendly output in `onComplete()`. Can output to console or a separate file.
- **Option B (Hook):** Use `afterAll` hook to print instructions when `results.success === false`.
- **Option C (Enhancement):** Add an `agentMode` option to `ConsoleReporter` that appends agent instructions when failures exist.

**Migration impact:** Low-medium. Useful for AI-driven workflows but not required for test execution.

---

## 4. Migration Complexity Assessment

### Overall Rating: **LOW** ✅

The vast majority of Moira's functionality has direct equivalents in testfold. The 10 Moira scripts (totaling ~2000+ lines of JavaScript) collapse into a single `test-runner.config.ts` file (~80-120 lines) plus testfold's built-in capabilities.

### Per-File Complexity

| File | Complexity | Rationale |
|------|-----------|-----------|
| `detect-test-env.js` | 🟢 Easy | Completely replaced by testfold CLI `-e` flag. No migration code needed. |
| `parse-jest-results.js` | 🟢 Easy | `JestParser` + `MarkdownReporter` + `TimingTextReporter` cover all features. Only coverage hint is missing (cosmetic). |
| `parse-playwright-results.js` | 🟢 Easy | `PlaywrightParser` + reporters cover everything. |
| `run-unit-tests.js` | 🟢 Easy | One suite definition in config. `{ name: 'unit', type: 'jest', command: '...', resultFile: 'unit.json' }` |
| `run-workflow-tests.js` | 🟢 Easy | Same as unit — one config entry. |
| `run-integration-tests.js` | 🟢 Easy | Same as unit + `env: { DB_PATH: ..., TELEGRAM_ENCRYPTION_KEY: ... }`. |
| `run-api-tests.js` | 🟡 Medium | Requires `environments` config with `urlExtractor` functions. Remote dual-file loading needs a hook. |
| `run-mcp-tools-tests.js` | 🟡 Medium | Same as API + dual env var logic (MCP_SERVER_URL + TEST_BASE_URL). |
| `run-e2e-tests.js` | 🟢 Easy | Suite `type: 'playwright'` + `environments` config. `--headed` via pass-through. |
| `run-all-tests.js` | 🟢 Easy | Replaced entirely by testfold CLI + `ConsoleReporter` + `SummaryLogReporter`. Config defines all 6 suites. |

### Migration Steps Summary

1. **Create `test-runner.config.ts`** — Define all 6 suites with their commands, result files, env vars, and environment routing. (~100 lines)
2. **Write `urlExtractor` functions** — For api, mcp-tools, e2e suites that need dynamic URL construction from env files. (~20 lines)
3. **Add hooks (optional)** — `beforeAll` for DOCKER_PORT validation, `beforeSuite` for remote file pre-check. (~15 lines)
4. **Add custom reporter (optional)** — For agent-friendly failure instructions if needed. (~30 lines)
5. **Delete all 10 Moira scripts** — testfold replaces them entirely.
6. **Update `package.json` scripts** — Replace `node tests/run-all-tests.js` with `testfold` commands.

### What testfold Adds (Beyond Moira)

| Capability | Benefit |
|-----------|---------|
| Fail-fast mode | Stop wasting time on remaining suites after critical failure |
| Process timeout with SIGKILL | Prevent hung tests from blocking CI forever |
| Hooks with guards | Programmatic suite skip/fail before execution |
| Custom parsers | Support for non-Jest/Playwright frameworks |
| Custom reporters | Extensible output formats |
| Grep/filter flags | Run subset of tests without modifying code |
| Workers configuration | Control parallelism per suite |
| JSON summary report | Machine-readable full results |
| Config validation (Zod) | Catch config errors before running tests |
| Single declarative config | Replace 10 imperative scripts with 1 config file |
