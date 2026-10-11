> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# Claude Supervisor → testfold Migration Mapping

> Function-by-function mapping from Claude Supervisor test scripts to testfold equivalents.
> Source: `supervisor-catalog.md` + `testfold-capabilities.md`
> Date: 2025-02-08

**Status Legend:**
- ✅ DIRECT — exact equivalent exists in testfold
- 🔄 PARTIAL — similar but not identical mechanism
- ⚙️ CONFIG — handled via testfold config, not code
- 🔌 HOOK — achievable via testfold hooks system
- ❌ GAP — no equivalent, needs custom code or testfold enhancement

---

## 1. File-by-File Mapping Tables

### 1.1 agent-stats-guard.js

Supervisor: Guards against real Claude API calls during tests. Records request counts before/after via HTTP `/stats` endpoint.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `beforeTests()` — records initial `realAgent.requestCount` from `/stats` HTTP endpoint | `hooks.beforeSuite` or `hooks.beforeAll` | 🔌 HOOK | Implement as async function in hooks config. Store initial stats in closure variable. |
| `afterTests()` — compares final stats, returns `{ ok: boolean, error? }` | `hooks.afterSuite` returning `GuardResult` | 🔌 HOOK | testfold's `GuardResult` is `{ ok: boolean, error?: string }` — exact same shape. afterSuite guard failure adds to `result.failed` and appends failure detail. |
| Module-level `initialStats` state | Closure variable in hooks config | 🔌 HOOK | Config file is a module — use module-level variable or closure to share state between beforeSuite/afterSuite. |
| `AGENT_STATS_PORT` env var / URL construction | Same approach in hook code | 🔌 HOOK | Read `process.env.AGENT_STATS_PORT` in the hook function. |
| Graceful skip when endpoint unreachable | Same `try/catch` in hook code | 🔌 HOOK | Return `undefined` (void) from hook to indicate no guard action. |
| HTTP `fetch()` to stats endpoint | Same `fetch()` in hook code | 🔌 HOOK | No framework support needed — native fetch in hook function. |

**Migration example:**
```typescript
// test-runner.config.ts
let agentInitialStats: any = null;

export default defineConfig({
  hooks: {
    beforeSuite: async (suite) => {
      if (['integration', 'e2e-jest', 'e2e-browser'].includes(suite.name)) {
        try {
          const port = process.env.AGENT_STATS_PORT || '7860';
          const res = await fetch(`http://localhost:${port}/stats`);
          agentInitialStats = await res.json();
        } catch { agentInitialStats = null; }
      }
    },
    afterSuite: async (suite, result) => {
      if (!agentInitialStats) return;
      try {
        const port = process.env.AGENT_STATS_PORT || '7860';
        const res = await fetch(`http://localhost:${port}/stats`);
        const final = await res.json();
        const delta = final.realAgent.requestCount - agentInitialStats.realAgent.requestCount;
        if (delta > 0) return { ok: false, error: `Real Claude API calls detected: ${delta}` };
      } catch { /* graceful skip */ }
    }
  }
});
```

---

### 1.2 parse-jest-results.js

Supervisor: CLI script that parses Jest JSON, generates failure reports, timing stats, and outputs JSON to stdout.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `stripAnsi(text)` — ANSI escape removal | `src/utils/ansi.ts` → `stripAnsi()` | ✅ DIRECT | Same regex `\x1b\[[0-9;]*m`. |
| `sanitizeFilename(name)` — safe filename from test name | `src/utils/sanitize.ts` → `sanitizeFilename()` | ✅ DIRECT | Same pipeline: lowercase, strip special, hyphenate, truncate 100. |
| Jest JSON parsing (numPassedTests, numFailedTests, etc.) | `JestParser.parse()` in `src/parsers/jest.ts` | ✅ DIRECT | Reads same fields: `numPassedTests`, `numFailedTests`, `numPendingTests`, `testResults[]`. |
| Framework crash detection (Error:, ReferenceError, SyntaxError, etc.) | `JestParser` crash detection | ✅ DIRECT | Same error patterns. Scans log file when JSON missing or 0 tests. |
| Error snippet extraction (±2/+10 lines around error) | `JestParser` error snippet extraction | ✅ DIRECT | Same ±2/+10 context lines approach. |
| Failure report .md generation (numbered files in failures dir) | `MarkdownReporter` in `src/reporters/markdown.ts` | ✅ DIRECT | Same format: `{NN}-{sanitized-name}.md` with hierarchy, file, error, stack, stdout, stderr, attachments. |
| Timing statistics (top 30 slowest tests, top 15 suites) | `TimingReporter` + `TimingTextReporter` | ✅ DIRECT | `TimingReporter` → `timing.json` (sorted by duration DESC). `TimingTextReporter` → `{suite}-timing.txt` with top 30 tests, top 15 files, setup/teardown overhead. |
| JSON stdout output as last line (IPC protocol) | Not needed — internal API | ⚙️ CONFIG | testfold uses `ParseResult` object returned directly from parser. No stdout IPC between processes. |
| CLI interface (`argv[2]`, `argv[3]`, `argv[4]`) | Not needed — integrated into testfold | ⚙️ CONFIG | testfold calls parser internally with file paths from suite config. |
| Duration calculation from `endTime - startTime` per test file | `JestParser` → `TestResult.duration` | ✅ DIRECT | Same calculation. |
| Pending/skipped mapping (Jest `pending` → `skipped`) | `JestParser` → `skipped` count from `numPendingTests` | ✅ DIRECT | Exact same mapping. |
| Test hierarchy from `ancestorTitles + title` | `JestParser` → `FailureDetail.testName` uses ` > ` join | ✅ DIRECT | Same approach. |
| Exit code 1 on failures | testfold process exit with `!results.success` | ✅ DIRECT | CLI exits non-zero when any failures. |

---

### 1.3 parse-playwright-results.js

Supervisor: CLI script that parses Playwright JSON, generates failure reports with stdout/stderr/attachments, timing stats.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `stripAnsi(text)` | `src/utils/ansi.ts` → `stripAnsi()` | ✅ DIRECT | Identical. |
| `sanitizeFilename(name)` | `src/utils/sanitize.ts` → `sanitizeFilename()` | ✅ DIRECT | Identical. |
| `collectFailures(suites)` — recursive suite/spec/test traversal | `PlaywrightParser.collectResults()` | ✅ DIRECT | Same recursive traversal of nested suites. |
| `collectTimings(suites)` — recursive duration collection | `PlaywrightParser` → `testResults[]` output | ✅ DIRECT | Duration collected during traversal, output as `TestResult[]`. |
| `collectFailedNames(suites)` — failed spec title collection | `PlaywrightParser` → `failures[].testName` | ✅ DIRECT | Failed names extracted from `FailureDetail[]`. |
| Playwright JSON parsing (`stats.expected/unexpected/skipped`) | `PlaywrightParser.parse()` | ✅ DIRECT | Same stats fields: `expected` → passed, `unexpected` → failed. |
| Framework crash detection (same error patterns + `globalSetup`) | `PlaywrightParser` crash detection | ✅ DIRECT | Same patterns plus `globalSetup`. |
| Corrupted JSON handling (fallback to log-based crash detection) | `PlaywrightParser` corrupted JSON handling | ✅ DIRECT | Falls back to log scan, returns `Result Parse Error` if no crash found. |
| Retry handling — last result from `test.results[]` | `PlaywrightParser` takes last result | ✅ DIRECT | `test.results[test.results.length - 1]`. |
| stdout capture from `result.stdout[].text` across retries | `PlaywrightParser` → `FailureDetail.stdout` | ✅ DIRECT | Collects from all retry attempts. |
| stderr capture from `result.stderr[].text` across retries | `PlaywrightParser` → `FailureDetail.stderr` | ✅ DIRECT | Collects from all retry attempts. |
| Attachments capture (name + path) across retries | `PlaywrightParser` → `FailureDetail.attachments[]` | ✅ DIRECT | `{ name, path }` from all retries. |
| Failure .md generation with stdout/stderr/attachments sections | `MarkdownReporter` | ✅ DIRECT | Includes all sections: Error, Stack, Stdout, Stderr, Attachments. |
| Timing stats (top 30 slowest tests) | `TimingTextReporter` | ✅ DIRECT | Default `topTests: 30`. |
| JSON stdout output (IPC protocol) | Not needed — internal API | ⚙️ CONFIG | Same as Jest parser — testfold uses direct `ParseResult`. |
| CLI interface | Not needed — integrated | ⚙️ CONFIG | Parser called internally. |

---

### 1.4 parse-results.js (legacy)

Supervisor: Simple/legacy Jest parser. Console output only, no failure files or timing.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `parseResults(filePath)` — Jest JSON parsing | `JestParser.parse()` | ✅ DIRECT | testfold's JestParser is a superset. |
| Console summary (status, total, passed, failed, pending, duration) | `ConsoleReporter.onComplete()` | ✅ DIRECT | ConsoleReporter prints summary table with same fields. |
| Failed test display with `ancestorTitles > title` | `ConsoleReporter.onSuiteComplete()` — shows failures with hierarchy | ✅ DIRECT | Uses `›` separator instead of `>`. |
| Duration from `Date.now() - data.startTime` | `JestParser` → `duration` from `endTime - startTime` per file | 🔄 PARTIAL | Supervisor uses wall clock; testfold sums per-file duration. Minor difference. |
| Exit code 0/1 | testfold CLI exit code | ✅ DIRECT | Exit based on `results.success`. |

---

### 1.5 run-all-tests.js (orchestrator)

Supervisor: Top-level orchestrator running all suites sequentially via `execSync`, collecting results, generating summary.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `parseArgs(args)` — CLI arg parsing (`--grep`, `--grep-invert`, `--file`, suite names) | `src/cli/args.ts` → `parseArgs()` using minimist | ✅ DIRECT | testfold supports all same flags plus more (`--config`, `--env`, `--reporter`, `--fail-fast`, `--parallel`). |
| `stripAnsi(text)` | `src/utils/ansi.ts` → `stripAnsi()` | ✅ DIRECT | Identical. |
| `log(message)` — dual output to console AND log buffer | `ConsoleReporter` (console) + `SummaryLogReporter` (log file) | ✅ DIRECT | Separate reporters handle each output channel. |
| `buildFilterArgs()` — construct `--grep/--file` flag string for child runners | `src/core/executor.ts` → `buildFilterArgs()` | ✅ DIRECT | Framework-specific mapping (Jest `--testNamePattern`, Playwright `--grep`). |
| `runTestSuite(suite, index, total)` — execute child runner via execSync | `Orchestrator.executeSuite()` + `Executor.executeCommand()` | ✅ DIRECT | testfold uses `child_process.spawn()` (not execSync) with better process control. |
| `formatNum(num, color)` — right-pad number with color | `ConsoleReporter` internal formatting | ✅ DIRECT | Console output formatting handled internally. |
| Suite definitions (unit, integration, e2e, browser) | `config.suites[]` in test-runner.config.ts | ⚙️ CONFIG | Defined declaratively instead of hardcoded. |
| Sequential execution (one suite at a time) | `--no-parallel` CLI flag or `parallel: false` in config | ⚙️ CONFIG | testfold default is parallel; use `--no-parallel` to match Supervisor behavior. |
| Parallel execution | `--parallel` (default) | ✅ DIRECT | Supervisor LACKS this — testfold advantage. |
| Suite filtering by positional name | Positional args: `testfold unit integration` | ✅ DIRECT | Case-insensitive match against suite names. |
| `--grep <pattern>` passthrough to child runners | `--grep` / `-g` CLI flag | ✅ DIRECT | Passed through to framework via `buildFilterArgs()`. |
| `--grep-invert <pattern>` passthrough | `--grep-invert` CLI flag | ✅ DIRECT | Supported. |
| `--file <path>` passthrough | `--file` / `-f` CLI flag | ✅ DIRECT | Appended directly to framework command. |
| 50MB `maxBuffer` for execSync | `Executor` 50MB buffer limit | ✅ DIRECT | Same limit, truncates from start. |
| JSON-last-line IPC protocol | Not needed — internal `ParseResult` API | ⚙️ CONFIG | testfold parsers return objects directly, no stdout IPC. |
| Summary table (Suite / Passed / Failed / Skipped / Time) | `ConsoleReporter.onComplete()` | ✅ DIRECT | Same table layout with colors. |
| Totals row with pass rate | `AggregatedResults.passRate` + `ConsoleReporter` | ✅ DIRECT | Exact same calculation: `(passed / total) * 100`. |
| "ALL PASSED" / "SOME FAILED" banner | `ConsoleReporter` → "✓ ALL TESTS PASSED" / "✗ TESTS FAILED" | ✅ DIRECT | Same banners. |
| `test-summary.log` plain text output | `SummaryLogReporter` → `test-summary.log` | ✅ DIRECT | Same concept: ANSI-stripped summary to file. |
| Per-suite error messages displayed inline (up to 10 failed tests) | `ConsoleReporter.onSuiteComplete()` shows first 3 failures + "+N more" | 🔄 PARTIAL | Supervisor shows up to 10 inline; testfold shows 3 + overflow count. Configurable would need code change. |
| Consolidated failed test list across all suites on failure | `ConsoleReporter.onComplete()` does not print consolidated failure list | ❌ GAP | Supervisor prints all failed test names grouped by suite at the end. testfold only shows per-suite failures during `onSuiteComplete`. |
| Re-run instructions on failure | Not implemented | ❌ GAP | Supervisor prints `node run-unit-tests.js --grep "test name"` for each failure. testfold has no equivalent. |
| Runner error list on failure | `ConsoleReporter` does not consolidate runner errors | 🔄 PARTIAL | Errors shown per-suite but not consolidated at end. |
| `dotenv.config()` from project root | `loadEnvFile()` via `-e` flag or `suite.environments` config | ⚙️ CONFIG | testfold uses environment routing instead of global dotenv. |

---

### 1.6 run-e2e-browser-tests.js

Supervisor: Runs Playwright browser E2E tests with guards, progress streaming, 10-min timeout.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `parseArgs()` — `--grep`, `--grep-invert`, `--file`, `--reporter`, passthrough | `src/cli/args.ts` | ✅ DIRECT | All flags supported. |
| Artifact cleanup (rmSync json, log, failures dir) | `cleanSuiteArtifacts()` in `src/utils/files.ts` | ✅ DIRECT | Per-suite selective cleanup. |
| Guard init: `agentBefore()` | `hooks.beforeSuite` | 🔌 HOOK | See agent-stats-guard mapping. |
| Guard init: `telegramBefore()` | `hooks.beforeSuite` | 🔌 HOOK | See telegram-stats-guard mapping. |
| Playwright spawn with constructed args | `Executor.executeCommand()` with `spawn()` | ✅ DIRECT | Shell spawn with detached process group. |
| `FORCE_COLOR=1` in child env | `Executor` always sets `FORCE_COLOR=1` | ✅ DIRECT | Hardcoded in executor. |
| `PLAYWRIGHT_JSON_OUTPUT_NAME` env var | `suite.resultFile` in config → testfold sets output path | ⚙️ CONFIG | Configure in suite definition. |
| `--reporter` override for Playwright's visual reporter (`list`, `dot`) | Pass-through args: `testfold browser -- --reporter=dot` | 🔄 PARTIAL | testfold's `-r` flag controls testfold reporters, not Playwright's. Use `--` pass-through to set Playwright reporter. But testfold doesn't auto-append `,json` — the command in config must include json reporter. |
| Real-time progress streaming (count ✓/✗ markers, print every 10 tests) | `Executor.onOutput` callback exists but no built-in progress counter | ❌ GAP | The `onOutput` streaming callback mechanism exists in Executor, but no reporter or feature uses it for live progress counting. |
| Suite timeout: 10 minutes (600,000ms) with SIGKILL on timeout | `suite.timeout` config + Executor SIGTERM→SIGKILL escalation | ⚙️ CONFIG | Set `timeout: 600000` in suite config. Executor sends SIGTERM, then SIGKILL after 5s grace period. |
| Process group kill on timeout | `Executor` → `process.kill(-proc.pid, signal)` | ✅ DIRECT | Kills entire process group (POSIX). |
| Guard checks: `agentAfter()` | `hooks.afterSuite` returning `GuardResult` | 🔌 HOOK | `{ ok: false, error }` adds failure to result. |
| Guard checks: `telegramAfter()` | `hooks.afterSuite` returning `GuardResult` | 🔌 HOOK | Same mechanism. |
| Parser invocation (spawn parse-playwright-results.js) | `PlaywrightParser.parse()` called automatically | ✅ DIRECT | testfold calls parser internally based on `suite.type: 'playwright'`. |
| Exit code = first non-zero of (playwright, parser, guard) | testfold requires successful process, parser and guard completion | 🔄 PARTIAL | Partial assertions remain available; final exit uses semantic failure categories. |
| `dotenv.config()` from project root | `suite.environments` or `-e` flag | ⚙️ CONFIG | Environment routing. |
| Log file: append stdout+stderr via `appendFileSync` | `Executor` writes combined log file | ✅ DIRECT | Executor writes command, exit code, duration, stdout, stderr to log file. |

---

### 1.7 run-e2e-tests.js

Supervisor: Runs Jest-based E2E tests with guards, env loading from `.env.test`.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `parseArgs()` — `--grep`, `--grep-invert`, `--file` | `src/cli/args.ts` | ✅ DIRECT | All flags supported. |
| `.env.test` loading via `dotenv.config` | `suite.environments.{name}.envFile` or `-e test` | ⚙️ CONFIG | Configure: `environments: { test: { envFile: '.env.test' } }`. Run with `testfold -e test`. |
| Artifact cleanup | `cleanSuiteArtifacts()` | ✅ DIRECT | Per-suite cleanup. |
| Guard init: agent + telegram `beforeTests()` | `hooks.beforeSuite` | 🔌 HOOK | Both guards in single hook. |
| Jest spawn: `npx jest --config jest.e2e.config.cjs --json --outputFile=...` | `Executor.executeCommand()` from suite `command` config | ⚙️ CONFIG | Define command in suite config. |
| `--grep` → `--testNamePattern` mapping | `Executor.buildFilterArgs()` | ✅ DIRECT | Jest-specific mapping built into executor. |
| `--grep-invert` parsed but unused (Jest limitation) | `Executor.buildFilterArgs()` passes `--grep-invert=X` as pass-through | 🔄 PARTIAL | testfold passes it through; Jest doesn't support it natively either. Same limitation. |
| `--file auth` → `tests/e2e/auth.spec.ts` shorthand resolution | `resolvePathPrefix()` via pass-through args | 🔄 PARTIAL | Supervisor: hardcoded per-suite directory + extension. testfold: glob-based resolution from `testsDir`. More flexible but different mechanism. |
| Output capture (stdout + stderr buffering) | `Executor` captures and writes to log file | ✅ DIRECT | 50MB buffer limit, written to suite log file. |
| Guard checks: agent + telegram `afterTests()` | `hooks.afterSuite` returning `GuardResult` | 🔌 HOOK | Both guards checked in single afterSuite hook. |
| Parser invocation via spawn | `JestParser.parse()` called automatically | ✅ DIRECT | Internal call based on `suite.type: 'jest'`. |
| Exit code = first non-zero | Success requires process, parser and guard completion | 🔄 PARTIAL | Semantic categories distinguish assertions, infrastructure errors and timeout. |

---

### 1.8 run-integration-tests.js

Supervisor: Runs Jest integration tests with guards. Structurally identical to run-e2e-tests.js with different paths.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `parseArgs()` — `--grep`, `--file` (no `--grep-invert`) | `src/cli/args.ts` | ✅ DIRECT | testfold supports all flags for all suites. |
| `.env` loading via `dotenv.config` | Default env or `suite.env` config | ⚙️ CONFIG | Environment variables in suite config. |
| Artifact cleanup | `cleanSuiteArtifacts()` | ✅ DIRECT | Per-suite cleanup. |
| Guard init: agent + telegram | `hooks.beforeSuite` | 🔌 HOOK | Same as other guarded suites. |
| Jest spawn: `npx jest tests/integration --json --outputFile=...` | Suite `command` config | ⚙️ CONFIG | `command: 'npx jest tests/integration --json --outputFile=...'` |
| `--grep` → `--testNamePattern` | `Executor.buildFilterArgs()` | ✅ DIRECT | Same mapping. |
| `--file nats-events` → `tests/integration/nats-events.test.ts` | `resolvePathPrefix()` or `--file` flag | 🔄 PARTIAL | Same difference as e2e: hardcoded vs glob-based. |
| Output capture | `Executor` log file | ✅ DIRECT | Same. |
| Guard checks | `hooks.afterSuite` | 🔌 HOOK | Same. |
| Parser invocation | `JestParser.parse()` | ✅ DIRECT | Automatic. |

---

### 1.9 run-unit-tests.js

Supervisor: Runs Jest unit tests. **No guards** (key difference from integration/e2e runners).

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `parseArgs()` — `--grep`, `--file` | `src/cli/args.ts` | ✅ DIRECT | All flags supported. |
| `.env` loading | Default env or `suite.env` config | ⚙️ CONFIG | Same as integration. |
| Artifact cleanup | `cleanSuiteArtifacts()` | ✅ DIRECT | Per-suite cleanup. |
| **NO guards** (unit tests don't need API protection) | Guards conditional on suite name in hooks | 🔌 HOOK | In hooks.beforeSuite/afterSuite, check `suite.name` to skip guards for unit suite. |
| Jest spawn: `npx jest tests/unit --json --outputFile=...` | Suite `command` config | ⚙️ CONFIG | Define in config. |
| `--grep` → `--testNamePattern` | `Executor.buildFilterArgs()` | ✅ DIRECT | Same. |
| `--file config` → `tests/unit/config.test.ts` | `resolvePathPrefix()` or `--file` flag | 🔄 PARTIAL | Same glob-based vs hardcoded difference. |
| Output capture | `Executor` log file | ✅ DIRECT | Same. |
| Parser invocation (no guard checks) | `JestParser.parse()` | ✅ DIRECT | Automatic. |

---

### 1.10 telegram-stats-guard.js

Supervisor: Guards against real Telegram messages during tests. Same pattern as agent-stats-guard.

| Supervisor Function/Feature | testfold Equivalent | Status | Notes |
|---|---|---|---|
| `beforeTests()` — records initial `realTelegram.totalCount` from `/stats` | `hooks.beforeSuite` or `hooks.beforeAll` | 🔌 HOOK | Implement in same hooks config as agent guard. |
| `afterTests()` — compares final Telegram stats, returns `{ ok, error }` | `hooks.afterSuite` returning `GuardResult` | 🔌 HOOK | testfold `GuardResult { ok: boolean, error?: string }` matches exactly. |
| Module-level `initialStats` state | Closure variable in hooks config | 🔌 HOOK | Same pattern as agent guard. |
| `TELEGRAM_STATS_PORT` env var (default `7861`) | Same approach in hook code | 🔌 HOOK | `process.env.TELEGRAM_STATS_PORT || '7861'` in hook function. |
| Three deltas: realDelta, mockDelta, skippedDelta | Custom logic in afterSuite hook | 🔌 HOOK | All delta calculations in hook function body. |
| Graceful skip when endpoint unreachable | `try/catch` in hook, return void | 🔌 HOOK | Same pattern as agent guard. |

---

## 2. Feature-Level Summary

Consolidated view of all unique features/capabilities across all Supervisor scripts.

### 2.1 Parsing & Analysis

| Feature | Supervisor Implementation | testfold Equivalent | Status |
|---|---|---|---|
| Jest JSON result parsing | `parse-jest-results.js` / `parse-results.js` | `JestParser` class | ✅ DIRECT |
| Playwright JSON result parsing | `parse-playwright-results.js` | `PlaywrightParser` class | ✅ DIRECT |
| ANSI escape stripping | `stripAnsi()` in 4 files (duplicated) | `src/utils/ansi.ts` (single source) | ✅ DIRECT |
| Filename sanitization | `sanitizeFilename()` in 2 parsers (duplicated) | `src/utils/sanitize.ts` (single source) | ✅ DIRECT |
| Framework crash detection | Both parsers: error patterns in log | Both `JestParser`/`PlaywrightParser` | ✅ DIRECT |
| Error snippet extraction (±2/+10 lines) | `parse-jest-results.js` | `JestParser` | ✅ DIRECT |
| Retry handling (Playwright last result) | `parse-playwright-results.js` | `PlaywrightParser` | ✅ DIRECT |
| Test hierarchy construction | `ancestorTitles + title` in Jest parser | `JestParser` → `FailureDetail.testName` | ✅ DIRECT |
| stdout/stderr/attachments from failures | `parse-playwright-results.js` | `PlaywrightParser` → `FailureDetail` | ✅ DIRECT |

### 2.2 Reporting & Output

| Feature | Supervisor Implementation | testfold Equivalent | Status |
|---|---|---|---|
| Per-test failure markdown reports | Both parsers generate `{NN}-{name}.md` | `MarkdownReporter` | ✅ DIRECT |
| Timing statistics (top N slowest) | Both parsers write `{category}-timing.txt` | `TimingReporter` (JSON) + `TimingTextReporter` (text) | ✅ DIRECT |
| Setup/teardown overhead calculation | Jest parser: suite total − sum(test durations) | `TimingTextReporter` | ✅ DIRECT |
| Console summary table (pass/fail/skip/time) | `run-all-tests.js` `formatNum()` + table | `ConsoleReporter.onComplete()` | ✅ DIRECT |
| Plain text summary log (no ANSI) | `run-all-tests.js` → `test-summary.log` | `SummaryLogReporter` | ✅ DIRECT |
| JSON summary output | Parsers' last-line JSON + `run-all-tests.js` | `JsonReporter` → `summary.json` | ✅ DIRECT |
| Pass rate percentage | `run-all-tests.js` totals row | `AggregatedResults.passRate` | ✅ DIRECT |
| "ALL PASSED" / "SOME FAILED" banner | `run-all-tests.js` colored banner | `ConsoleReporter` colored banner | ✅ DIRECT |
| Consolidated failure list across suites | `run-all-tests.js` lists all failures at end | Not implemented | ❌ GAP |
| Re-run instructions for failed tests | `run-all-tests.js` prints re-run commands | Not implemented | ❌ GAP |
| Real-time progress streaming (N tests done) | `run-e2e-browser-tests.js` counts ✓/✗ markers | `Executor.onOutput` exists but unused | ❌ GAP |
| Per-suite inline error display (up to 10) | `run-all-tests.js` shows 10 failed names | `ConsoleReporter` shows 3 failures + "+N" | 🔄 PARTIAL |

### 2.3 Execution & Orchestration

| Feature | Supervisor Implementation | testfold Equivalent | Status |
|---|---|---|---|
| Sequential suite execution | `run-all-tests.js` via `execSync` | `--no-parallel` or `parallel: false` | ⚙️ CONFIG |
| Parallel suite execution | **Not supported** | `--parallel` (default: true) | ✅ DIRECT (testfold advantage) |
| Suite filtering by name | Positional args in `run-all-tests.js` | Positional args in CLI | ✅ DIRECT |
| `--grep` pattern filter | All runners → `--testNamePattern` (Jest) / `--grep` (PW) | `--grep` / `-g` → `buildFilterArgs()` | ✅ DIRECT |
| `--grep-invert` filter | Some runners (limited support) | `--grep-invert` flag | ✅ DIRECT |
| `--file` filter with shorthand resolution | Per-runner hardcoded path resolution | `--file` flag + `resolvePathPrefix()` | 🔄 PARTIAL |
| Pass-through args to framework | `run-e2e-browser-tests.js` passthrough array | `--` separator in CLI | ✅ DIRECT |
| Fail-fast (stop on first failure) | **Not supported** | `--fail-fast` flag | ✅ DIRECT (testfold advantage) |
| Process spawning with shell | All runners use `spawn()` | `Executor` → `spawn({ shell: true, detached: true })` | ✅ DIRECT |
| FORCE_COLOR=1 in child env | `run-e2e-browser-tests.js` only | `Executor` always sets for all suites | ✅ DIRECT |
| Suite timeout with kill | `run-e2e-browser-tests.js` (10 min, SIGKILL) | `suite.timeout` + SIGTERM→SIGKILL escalation | ⚙️ CONFIG |
| Process group killing (POSIX) | `run-e2e-browser-tests.js` kills process | `Executor` → `process.kill(-pid, signal)` | ✅ DIRECT |
| 50MB output buffer limit | `run-all-tests.js` `maxBuffer` | `Executor` 50MB buffer | ✅ DIRECT |
| Per-suite artifact cleanup | All runners: rmSync + mkdirSync | `cleanSuiteArtifacts()` — selective | ✅ DIRECT |
| Graceful error recovery (parse despite non-zero exit) | `run-all-tests.js` catches execSync error, still parses | `Orchestrator` always attempts parse after execution | ✅ DIRECT |

### 2.4 Environment & Configuration

| Feature | Supervisor Implementation | testfold Equivalent | Status |
|---|---|---|---|
| `.env` file loading | `dotenv.config()` in each runner | `loadEnvFile()` + `suite.environments` | ⚙️ CONFIG |
| `.env.test` variant loading | `run-e2e-tests.js` loads `.env.test` | `environments: { test: { envFile: '.env.test' } }` | ⚙️ CONFIG |
| Suite command definitions (hardcoded) | Each runner defines its command inline | `suite.command` in config file | ⚙️ CONFIG |
| Workers/parallelism per suite | Not configurable | `suite.workers` → `--maxWorkers` / `--workers` | ✅ DIRECT (testfold advantage) |
| Environment-specific baseUrl | Not supported | `suite.environments.{env}.baseUrl` → `TEST_BASE_URL` | ✅ DIRECT (testfold advantage) |
| URL extraction from env file | Not supported | `suite.environments.{env}.urlExtractor` function | ✅ DIRECT (testfold advantage) |

### 2.5 Guards & Safety

| Feature | Supervisor Implementation | testfold Equivalent | Status |
|---|---|---|---|
| Agent API call guard (before/after) | `agent-stats-guard.js` imported by 3 runners | `hooks.beforeSuite`/`afterSuite` with `GuardResult` | 🔌 HOOK |
| Telegram message guard (before/after) | `telegram-stats-guard.js` imported by 3 runners | `hooks.beforeSuite`/`afterSuite` with `GuardResult` | 🔌 HOOK |
| Conditional guards (skip for unit tests) | `run-unit-tests.js` doesn't import guards | Check `suite.name` in hook to skip | 🔌 HOOK |
| Guard graceful degradation (endpoint down) | Both guards: catch error → `{ ok: true }` | Return void/undefined from hook → no guard action | 🔌 HOOK |
| Guard result shape `{ ok, error }` | Both guards return this shape | testfold `GuardResult { ok: boolean, error?: string }` | 🔌 HOOK |

### 2.6 IPC & Architecture

| Feature | Supervisor Implementation | testfold Equivalent | Status |
|---|---|---|---|
| JSON-last-line stdout protocol | All parsers/runners use last stdout line as JSON | Internal `ParseResult` API (no IPC needed) | ⚙️ CONFIG |
| Separate CLI scripts per suite | 4 runner scripts + 3 parser scripts | Single `testfold` CLI + config file | ⚙️ CONFIG |
| Separate CLI parsers spawned by runners | Parsers spawned as child processes | Parsers called as internal TypeScript classes | ⚙️ CONFIG |

---

## 3. Gap Analysis

### GAP 1: Consolidated Failure List Across Suites

**What it does:** After all suites complete, Supervisor's `run-all-tests.js` prints a consolidated list of ALL failed test names grouped by suite, followed by all runner errors. This provides a single place to see everything that failed.

**Why testfold can't do it:** `ConsoleReporter.onSuiteComplete()` shows up to 3 failures per suite as they complete, but `onComplete()` only prints the summary table and banner — it does not re-list all failures across suites.

**Suggested workaround:**
- **Short-term:** Use `JsonReporter` output (`summary.json`) which contains `failedTests[]` across all suites. Parse it after run.
- **Enhancement:** Add a "consolidated failures" section to `ConsoleReporter.onComplete()` that iterates `results.suites[].failures[]` and prints all failed test names when `results.success === false`. Low complexity (~20 lines).

---

### GAP 2: Re-Run Instructions for Failed Tests

**What it does:** Supervisor prints executable re-run commands for each failed test, e.g.:
```
To re-run failed tests:
  node run-unit-tests.js --grep "BaseStore should handle config"
  node run-integration-tests.js --grep "NATS events flow"
```

**Why testfold can't do it:** No reporter generates re-run commands. The information exists (suite name + test name) but nothing formats it as a CLI command.

**Suggested workaround:**
- **Short-term:** Custom reporter that generates re-run commands from `FailureDetail` in `onComplete()`.
- **Enhancement:** Add re-run instructions to `ConsoleReporter.onComplete()` when failures exist. Format: `testfold {suite} --grep "{testName}"`. Medium complexity (~30 lines). Requires knowing the testfold binary name (could use `process.argv[1]` or hardcode `testfold`).

---

### GAP 3: Real-Time Progress Streaming

**What it does:** `run-e2e-browser-tests.js` parses Playwright stdout in real-time, counting `✓`/`✗` markers and printing `Progress: N tests...` every 10 completed tests. Gives feedback during long-running browser test suites.

**Why testfold can't do it:** The `Executor` has an `onOutput(chunk)` callback that receives stdout chunks in real-time, but:
1. No reporter or orchestrator feature uses this callback
2. No built-in logic to parse pass/fail markers from output
3. The `Orchestrator` does not wire `onOutput` to any reporter method

**Suggested workaround:**
- **Short-term:** Custom reporter is not sufficient since reporters don't receive streaming output — only `onStart`, `onSuiteComplete`, `onComplete` events.
- **Enhancement option A:** Add `onOutput?(suite: Suite, chunk: string): void` method to Reporter interface. Wire `Executor.onOutput` → `Orchestrator` → active reporters. Reporters that implement it can parse and display progress. Medium-high complexity.
- **Enhancement option B:** Add a `progress` option to suite config that enables built-in progress counting in the orchestrator. The orchestrator would count markers and print periodic updates. Medium complexity.
- **Pragmatic approach:** For most projects, `ConsoleReporter` + per-suite duration shown on completion is sufficient. Real-time progress is a nice-to-have for very long test suites (10+ minutes).

---

## 4. Migration Complexity Assessment

### Overall Rating: **LOW-MEDIUM**

The Supervisor test scripts are a collection of ad-hoc JavaScript files with significant code duplication. testfold was designed to replace exactly this pattern with a unified, configurable framework. The vast majority of Supervisor functionality maps directly to testfold features or config.

### File-by-File Difficulty

| File | Difficulty | Rationale |
|---|---|---|
| **parse-jest-results.js** | 🟢 Easy | 100% covered by `JestParser` + `MarkdownReporter` + `TimingTextReporter`. Zero custom code needed. |
| **parse-playwright-results.js** | 🟢 Easy | 100% covered by `PlaywrightParser` + `MarkdownReporter` + `TimingTextReporter`. Zero custom code needed. |
| **parse-results.js** (legacy) | 🟢 Easy | Superseded by `JestParser` + `ConsoleReporter`. Already obsolete in Supervisor. |
| **run-unit-tests.js** | 🟢 Easy | Suite definition in config + `command` field. No guards needed. |
| **run-integration-tests.js** | 🟢 Easy | Suite definition in config + guards as hooks. |
| **run-e2e-tests.js** | 🟢 Easy | Suite definition in config + `.env.test` environment routing + guards. |
| **run-e2e-browser-tests.js** | 🟡 Medium | Mostly config. Progress streaming (GAP 3) lost. Playwright reporter flag needs pass-through workaround. |
| **run-all-tests.js** | 🟡 Medium | Orchestration → testfold config + CLI. Consolidated failure list (GAP 1) and re-run instructions (GAP 2) lost. |
| **agent-stats-guard.js** | 🟢 Easy | Direct translation to `hooks.beforeSuite`/`afterSuite` with `GuardResult`. |
| **telegram-stats-guard.js** | 🟢 Easy | Same pattern as agent guard. |

### Migration Steps Summary

1. **Create `test-runner.config.ts`** — Define all 4 suites (unit, integration, e2e-jest, e2e-browser) with commands, result files, types, timeouts. (~30 lines)

2. **Add hooks for guards** — Implement agent + telegram guard logic in `hooks.beforeSuite`/`afterSuite` with suite-name filtering. (~50 lines)

3. **Configure environment routing** — Set up `environments` for e2e suites needing `.env.test`. (~10 lines)

4. **Configure reporters** — `reporters: ['console', 'json', 'markdown-failures', 'timing', 'timing-text', 'summary-log']` (~1 line)

5. **Delete 10 Supervisor scripts** — All functionality now in testfold config + framework.

6. **Update `package.json`** — Replace `"test": "node tests/scripts/run-all-tests.js"` with `"test": "testfold"`.

### What's Gained in Migration

| Benefit | Description |
|---|---|
| **Parallel execution** | Suites run in parallel by default (Supervisor is sequential only) |
| **Fail-fast** | Stop on first failure — saves time in CI |
| **Zero code duplication** | `stripAnsi`, `sanitizeFilename`, `parseArgs` duplicated 2-5x in Supervisor → single source in testfold |
| **Declarative config** | 10 imperative scripts → 1 declarative config file |
| **Workers control** | `suite.workers` for per-suite parallelism tuning |
| **Environment routing** | `baseUrl`, `urlExtractor`, env file per environment |
| **Custom parsers/reporters** | Extensible via modules |
| **Type safety** | Zod validation + TypeScript types |
| **Per-suite artifact isolation** | Running one suite doesn't clean other suites' artifacts |

### What's Lost in Migration

| Loss | Severity | Mitigation |
|---|---|---|
| Consolidated failure list at end | Low | Use `summary.json` or enhance `ConsoleReporter` |
| Re-run instructions | Low | Custom reporter or `ConsoleReporter` enhancement |
| Real-time progress streaming | Low | Rarely needed; enhancement possible via Reporter interface extension |
| Per-suite inline error count (10 vs 3) | Trivial | Configurable constant in `ConsoleReporter` |
