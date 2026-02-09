> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# Claude Supervisor → testfold Migration Plan

> Replaces 10 ad-hoc JavaScript test scripts with a single `test-runner.config.ts` and the `testfold` CLI.
> Based on: `supervisor-mapping.md`, `supervisor-catalog.md`, `testfold-capabilities.md`
> Date: 2025-02-08

---

## 1. Executive Summary

### Scope

This plan migrates the Claude Supervisor test infrastructure from 10 standalone JavaScript scripts (`tests/scripts/`) to a unified `testfold` configuration. The scripts being replaced:

| Script | Role |
|--------|------|
| `run-all-tests.js` | Orchestrator — runs all suites sequentially, collects results, prints summary |
| `run-unit-tests.js` | Jest unit test runner (no guards) |
| `run-integration-tests.js` | Jest integration test runner (with guards) |
| `run-e2e-tests.js` | Jest E2E test runner (with guards, `.env.test`) |
| `run-e2e-browser-tests.js` | Playwright browser E2E runner (with guards, timeout, streaming) |
| `parse-jest-results.js` | Jest result parser — failure reports, timing, JSON summary |
| `parse-playwright-results.js` | Playwright result parser — failure reports with stdout/stderr/attachments |
| `parse-results.js` | Legacy Jest parser (superseded by `parse-jest-results.js`) |
| `agent-stats-guard.js` | Guard: detects real Claude API calls during tests |
| `telegram-stats-guard.js` | Guard: detects real Telegram messages during tests |

### Overall Complexity: **LOW-MEDIUM**

- **8 of 10 scripts**: 🟢 Easy — direct equivalents exist in testfold
- **2 of 10 scripts**: 🟡 Medium — `run-e2e-browser-tests.js` (progress streaming lost) and `run-all-tests.js` (consolidated failure list lost)
- **3 identified gaps**: all LOW severity with workarounds

### Key Benefits

| Benefit | Detail |
|---------|--------|
| **10 scripts → 1 config file** | Declarative `test-runner.config.ts` replaces all imperative scripts |
| **Zero code duplication** | `stripAnsi`, `sanitizeFilename`, `parseArgs` duplicated 2–5× in Supervisor → single source in testfold |
| **Type safety** | Zod config validation + TypeScript types with `defineConfig()` autocomplete |
| **Fail-fast mode** | `--fail-fast` stops after first failed suite (Supervisor lacks this) |
| **Per-suite worker control** | `suite.workers` for parallelism tuning per suite |
| **Environment routing** | `baseUrl`, `urlExtractor`, per-environment env files |
| **Per-suite artifact isolation** | Running one suite doesn't clean other suites' artifacts |
| **Extensible** | Custom parsers and reporters via module paths |

---

## 2. testfold.config.ts Draft

This is a complete, working config file. Place at Claude Supervisor project root.

**File: `/Users/mike/WebstormProjects/claude-supervisor-dev/test-runner.config.ts`**

```typescript
import { defineConfig, type Suite, type SuiteResult, type GuardResult } from 'testfold';

// ─── Guard State (per-suite isolation for sequential execution) ─────────────

let agentInitialStats: Record<string, any> = {};
let telegramInitialStats: Record<string, any> = {};

const GUARDED_SUITES = ['integration', 'e2e', 'e2e-browser'];

// ─── Guard Helpers ──────────────────────────────────────────────────────────

async function fetchStats(port: string): Promise<any | null> {
  try {
    const res = await fetch(`http://localhost:${port}/stats`);
    return await res.json();
  } catch {
    return null;
  }
}

async function agentGuardBefore(suiteName: string): Promise<void> {
  const port = process.env.AGENT_STATS_PORT || '7860';
  agentInitialStats[suiteName] = await fetchStats(port);
}

async function agentGuardAfter(suiteName: string): Promise<GuardResult | void> {
  const initial = agentInitialStats[suiteName];
  if (!initial) return; // guard was skipped (endpoint unreachable)

  const port = process.env.AGENT_STATS_PORT || '7860';
  const final = await fetchStats(port);
  if (!final) return; // graceful degradation

  const delta = final.realAgent.requestCount - initial.realAgent.requestCount;
  if (delta > 0) {
    return { ok: false, error: `Real Claude API calls detected during ${suiteName}: ${delta} calls` };
  }
}

async function telegramGuardBefore(suiteName: string): Promise<void> {
  const port = process.env.TELEGRAM_STATS_PORT || '7861';
  telegramInitialStats[suiteName] = await fetchStats(port);
}

async function telegramGuardAfter(suiteName: string): Promise<GuardResult | void> {
  const initial = telegramInitialStats[suiteName];
  if (!initial) return;

  const port = process.env.TELEGRAM_STATS_PORT || '7861';
  const final = await fetchStats(port);
  if (!final) return;

  const realDelta = final.realTelegram.totalCount - initial.realTelegram.totalCount;
  if (realDelta > 0) {
    return { ok: false, error: `Real Telegram messages sent during ${suiteName}: ${realDelta} messages` };
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────

export default defineConfig({
  artifactsDir: 'test-results/artifacts',
  testsDir: './tests',

  // Sequential execution — required for guard correctness
  // (guards measure API call deltas between before/after; parallel would cause false positives)
  parallel: false,

  reporters: [
    'console',
    'json',
    'markdown-failures',
    'timing',
    'timing-text',
    'summary-log',
  ],

  suites: [
    // ── Unit Tests (no guards) ────────────────────────────────────────────
    {
      name: 'unit',
      type: 'jest',
      command: 'npx jest tests/unit --json --outputFile=test-results/artifacts/unit.json',
      resultFile: 'unit.json',
    },

    // ── Integration Tests (with guards) ───────────────────────────────────
    {
      name: 'integration',
      type: 'jest',
      command: 'npx jest tests/integration --json --outputFile=test-results/artifacts/integration.json',
      resultFile: 'integration.json',
    },

    // ── E2E Jest Tests (with guards, .env.test) ──────────────────────────
    {
      name: 'e2e',
      type: 'jest',
      command: 'npx jest --config jest.e2e.config.cjs --json --outputFile=test-results/artifacts/e2e-jest.json',
      resultFile: 'e2e-jest.json',
      environments: {
        test: {
          envFile: '.env.test',
        },
      },
    },

    // ── E2E Browser / Playwright Tests (with guards, 10min timeout) ──────
    {
      name: 'e2e-browser',
      type: 'playwright',
      command: 'npx playwright test --reporter=list,json',
      resultFile: 'e2e-browser.json',
      timeout: 600000, // 10 minutes (matches Supervisor's SIGKILL timeout)
      env: {
        PLAYWRIGHT_JSON_OUTPUT_NAME: 'test-results/artifacts/e2e-browser.json',
      },
    },
  ],

  hooks: {
    beforeSuite: async (suite: Suite): Promise<void | GuardResult> => {
      if (!GUARDED_SUITES.includes(suite.name)) return;

      await agentGuardBefore(suite.name);
      await telegramGuardBefore(suite.name);
    },

    afterSuite: async (suite: Suite, result: SuiteResult): Promise<void | GuardResult> => {
      if (!GUARDED_SUITES.includes(suite.name)) return;

      // Check agent guard first
      const agentResult = await agentGuardAfter(suite.name);
      if (agentResult && !agentResult.ok) return agentResult;

      // Check telegram guard
      const telegramResult = await telegramGuardAfter(suite.name);
      if (telegramResult && !telegramResult.ok) return telegramResult;
    },
  },
});
```

### Config Design Decisions

| Decision | Rationale |
|----------|-----------|
| `parallel: false` | Guards measure API call deltas between beforeSuite/afterSuite. Parallel execution would attribute calls from one suite to another (false positives). Matches Supervisor's sequential behavior. |
| Per-suite guard state (object keyed by name) | Even though sequential, using per-suite state makes the guards safe if parallel is ever enabled. |
| `GUARDED_SUITES` array | Unit tests don't interact with external services — guards skipped. Matches Supervisor's `run-unit-tests.js` which does not import guards. |
| `afterSuite` returns first failure | testfold's `GuardResult` only accepts one error. Agent guard checked first (higher priority), then telegram. |
| `environments.test.envFile` on e2e suite | Supervisor's `run-e2e-tests.js` loads `.env.test` via `dotenv.config({ path: '.env.test' })`. testfold equivalent: environment routing with `-e test`. |
| `timeout: 600000` on e2e-browser | Matches Supervisor's 10-minute timeout with SIGKILL. testfold escalates SIGTERM → SIGKILL after 5s grace period. |
| `PLAYWRIGHT_JSON_OUTPUT_NAME` in suite env | Playwright's JSON reporter reads this env var for output path. Must match `resultFile` resolved against `artifactsDir`. |
| `--reporter=list,json` in Playwright command | Supervisor appends `,json` to whatever reporter is selected. `list` is the default visual reporter. Users can override via pass-through: `testfold e2e-browser -- --reporter=dot,json`. |

### CLI Usage After Migration

```bash
# Run all suites (replaces: node tests/scripts/run-all-tests.js)
testfold

# Run specific suites (replaces: node tests/scripts/run-all-tests.js unit integration)
testfold unit integration

# With grep filter (replaces: node tests/scripts/run-all-tests.js --grep "pattern")
testfold --grep "BaseStore"
testfold -g "NATS events"

# With file filter (replaces: node tests/scripts/run-unit-tests.js --file config)
testfold unit --file tests/unit/config.test.ts

# Short file prefix via pass-through (testfold resolves to full path)
testfold unit -- config

# E2E browser with grep (replaces: node run-e2e-browser-tests.js --grep "UC130")
testfold e2e-browser --grep "UC130"

# E2E browser with Playwright reporter override
testfold e2e-browser -- --reporter=dot,json

# E2E browser headed mode (Playwright pass-through)
testfold e2e-browser -- --headed

# E2E Jest with environment (loads .env.test)
testfold e2e -e test

# Grep invert
testfold --grep-invert "slow"

# Fail fast
testfold --fail-fast
```

---

## 3. Migration Steps (Ordered)

### Step 1: Install testfold

```bash
cd /Users/mike/WebstormProjects/claude-supervisor-dev
npm install --save-dev testfold
```

Verify installation:

```bash
npx testfold --version
```

### Step 2: Create Config File

Create `test-runner.config.ts` at project root with the contents from Section 2 above.

```bash
# The file path:
# /Users/mike/WebstormProjects/claude-supervisor-dev/test-runner.config.ts
```

testfold auto-discovers `test-runner.config.ts` in CWD — no `-c` flag needed.

### Step 3: Verify Config Loads

```bash
npx testfold --help
```

If config has validation errors, testfold will report them with Zod error messages.

### Step 4: Test Each Suite Individually

Run each suite one at a time and compare output with the old scripts:

```bash
# Unit tests (compare with: node tests/scripts/run-unit-tests.js)
npx testfold unit

# Integration tests (compare with: node tests/scripts/run-integration-tests.js)
npx testfold integration

# E2E Jest tests (compare with: node tests/scripts/run-e2e-tests.js)
npx testfold e2e -e test

# E2E Browser tests (compare with: node tests/scripts/run-e2e-browser-tests.js)
npx testfold e2e-browser
```

For each suite, verify:
- Exit code matches (0 for pass, non-zero for fail)
- Result files generated in `test-results/artifacts/`
- Failure reports generated in `test-results/artifacts/failures/{suite-name}/`
- Timing files generated in `test-results/artifacts/{suite-name}-timing.txt`
- Guard detection works (if applicable — trigger a known guard failure to test)

### Step 5: Test Full Run

```bash
# Compare with: node tests/scripts/run-all-tests.js
npx testfold
```

Verify:
- All 4 suites execute sequentially
- `test-results/artifacts/test-summary.log` generated
- `summary.json` generated at project root (or `test-results/summary.json`)
- Console summary table matches format
- Exit code is non-zero if any suite failed

### Step 6: Test CLI Filters

```bash
# Suite filtering
npx testfold unit integration

# Grep
npx testfold unit --grep "BaseStore"

# File filter
npx testfold integration --file tests/integration/nats-events.test.ts

# Path prefix resolution
npx testfold unit -- config

# Grep invert
npx testfold --grep-invert "slow"
```

### Step 7: Update package.json Scripts

See Section 5 for before/after. Apply the changes.

### Step 8: Test via npm Scripts

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:browser
```

### Step 9: Remove Old Scripts

Once all verification passes, delete the Supervisor scripts:

```bash
rm tests/scripts/run-all-tests.js
rm tests/scripts/run-unit-tests.js
rm tests/scripts/run-integration-tests.js
rm tests/scripts/run-e2e-tests.js
rm tests/scripts/run-e2e-browser-tests.js
rm tests/scripts/parse-jest-results.js
rm tests/scripts/parse-playwright-results.js
rm tests/scripts/parse-results.js
rm tests/scripts/agent-stats-guard.js
rm tests/scripts/telegram-stats-guard.js
```

If `tests/scripts/` is now empty, remove the directory:

```bash
rmdir tests/scripts
```

### Step 10: Final Verification

```bash
npm test
```

Confirm all suites pass, all artifacts generated, guards functional.

---

## 4. Gaps and Workarounds

| # | Gap | Supervisor Behavior | Impact | Workaround | Effort |
|---|-----|---------------------|--------|------------|--------|
| 1 | **Consolidated failure list** | `run-all-tests.js` prints all failed test names grouped by suite at the end of the run | Low — failures still visible per-suite during run + in `summary.json` `failedTests[]` | **Option A:** Use `summary.json` output (already contains all `failedTests`). **Option B:** Enhance `ConsoleReporter.onComplete()` to iterate `results.suites[].failures[]` (~20 lines in testfold source). | Option A: 0h, Option B: 1h |
| 2 | **Re-run instructions** | Prints `node run-unit-tests.js --grep "test name"` for each failed test | Low — users already know how to re-run with `--grep` | **Option A:** Read `summary.json` after run. **Option B:** Custom reporter that generates `testfold {suite} --grep "{name}"` in `onComplete()` (~30 lines). | Option A: 0h, Option B: 2h |
| 3 | **Real-time progress streaming** | `run-e2e-browser-tests.js` counts ✓/✗ markers and prints progress every 10 tests | Low — only useful for 10+ minute browser runs; per-suite completion visible | **Option A:** Accept loss (console shows suite completion). **Option B:** Extend `Reporter` interface with `onOutput(suite, chunk)` and wire through Orchestrator (medium-high effort in testfold core). | Option A: 0h, Option B: 8h |
| 4 | **Inline error count (10 vs 3)** | Shows up to 10 failed test names per suite inline | Trivial — all failures in markdown reports and `summary.json` | Accept difference (3 shown + "+N more" message) or modify `ConsoleReporter` constant. | 0h or 0.5h |
| 5 | **Playwright reporter override via `--reporter` flag** | `run-e2e-browser-tests.js` has `--reporter` flag that sets Playwright's visual reporter (e.g., `dot`, `list`) while always appending `,json` | Low — testfold's `-r` controls testfold reporters, not Playwright's | Use pass-through: `testfold e2e-browser -- --reporter=dot,json`. Note: user must remember to include `,json` to avoid breaking result parsing. Document this. | 0h (documentation) |

### Recommendation

Accept all gaps for initial migration. Gaps 1 and 2 are the most likely to be missed by developers — consider filing issues to enhance `ConsoleReporter` in testfold.

---

## 5. package.json Scripts Updates

### Before (Supervisor)

```json
{
  "scripts": {
    "test": "node tests/scripts/run-all-tests.js",
    "test:unit": "node tests/scripts/run-unit-tests.js",
    "test:integration": "node tests/scripts/run-integration-tests.js",
    "test:e2e": "node tests/scripts/run-e2e-tests.js",
    "test:browser": "node tests/scripts/run-e2e-browser-tests.js"
  }
}
```

### After (testfold)

```json
{
  "scripts": {
    "test": "testfold",
    "test:unit": "testfold unit",
    "test:integration": "testfold integration",
    "test:e2e": "testfold e2e -e test",
    "test:browser": "testfold e2e-browser"
  }
}
```

### Notes

| Script | Change Detail |
|--------|---------------|
| `test` | `node tests/scripts/run-all-tests.js` → `testfold` |
| `test:unit` | `node tests/scripts/run-unit-tests.js` → `testfold unit` |
| `test:integration` | `node tests/scripts/run-integration-tests.js` → `testfold integration` |
| `test:e2e` | `node tests/scripts/run-e2e-tests.js` → `testfold e2e -e test` (loads `.env.test` via environment routing) |
| `test:browser` | `node tests/scripts/run-e2e-browser-tests.js` → `testfold e2e-browser` |

**Filter pass-through works the same via npm:**

```bash
# Before
npm run test:unit -- --grep "BaseStore"
npm run test:browser -- --grep "UC130"

# After
npm run test:unit -- --grep "BaseStore"
npm run test:browser -- --grep "UC130"
```

---

## 6. Verification Checklist

### Suite Execution

- [ ] `testfold unit` — runs Jest unit tests, exit code 0 on pass
- [ ] `testfold integration` — runs Jest integration tests with guards
- [ ] `testfold e2e -e test` — runs Jest E2E tests, loads `.env.test`
- [ ] `testfold e2e-browser` — runs Playwright browser tests with 10min timeout
- [ ] `testfold` — runs all 4 suites sequentially

### Guard Verification

- [ ] Agent guard: `beforeSuite` records `realAgent.requestCount` from `/stats`
- [ ] Agent guard: `afterSuite` detects delta > 0 and returns `{ ok: false }`
- [ ] Telegram guard: `beforeSuite` records `realTelegram.totalCount` from `/stats`
- [ ] Telegram guard: `afterSuite` detects delta > 0 and returns `{ ok: false }`
- [ ] Guards skip gracefully when stats endpoints are unreachable
- [ ] Guards are NOT applied to `unit` suite
- [ ] Guard failures add to `result.failed` count and appear in failure reports

### Artifact Output

- [ ] `test-results/artifacts/unit.json` — Jest JSON result
- [ ] `test-results/artifacts/unit.log` — combined stdout+stderr log
- [ ] `test-results/artifacts/integration.json` — Jest JSON result
- [ ] `test-results/artifacts/integration.log` — combined log
- [ ] `test-results/artifacts/e2e-jest.json` — Jest JSON result
- [ ] `test-results/artifacts/e2e-jest.log` — combined log
- [ ] `test-results/artifacts/e2e-browser.json` — Playwright JSON result
- [ ] `test-results/artifacts/e2e-browser.log` — combined log
- [ ] `test-results/artifacts/failures/unit/*.md` — per-test failure reports
- [ ] `test-results/artifacts/failures/integration/*.md` — per-test failure reports
- [ ] `test-results/artifacts/failures/e2e-jest/*.md` — per-test failure reports (with Playwright stdout/stderr/attachments for e2e-browser)
- [ ] `test-results/artifacts/failures/e2e-browser/*.md` — per-test failure reports
- [ ] `test-results/artifacts/timing.json` — all tests sorted by duration
- [ ] `test-results/artifacts/unit-timing.txt` — unit timing stats
- [ ] `test-results/artifacts/integration-timing.txt` — integration timing stats
- [ ] `test-results/artifacts/e2e-jest-timing.txt` — e2e timing stats (Jest suites)
- [ ] `test-results/artifacts/e2e-browser-timing.txt` — e2e-browser timing stats
- [ ] `test-results/artifacts/test-summary.log` — plain text summary (no ANSI)
- [ ] `summary.json` — structured JSON summary

### Exit Codes

- [ ] All suites pass → exit code 0
- [ ] Any suite fails → exit code non-zero
- [ ] Guard failure → exit code non-zero
- [ ] Suite timeout (e2e-browser > 10min) → exit code non-zero, process killed

### CLI Filters

- [ ] `testfold unit` — runs only unit suite
- [ ] `testfold unit integration` — runs two suites
- [ ] `testfold --grep "pattern"` — passes `--testNamePattern` to Jest / `--grep` to Playwright
- [ ] `testfold --grep-invert "pattern"` — exclusion filter
- [ ] `testfold --file tests/unit/config.test.ts` — file filter
- [ ] `testfold unit -- config` — path prefix resolution to full path
- [ ] `testfold e2e-browser -- --headed` — Playwright pass-through

### Reporter Output

- [ ] Console output: banner, per-suite results, summary table, pass rate, ALL PASSED/TESTS FAILED banner
- [ ] Console: failure hierarchy displayed as `describe › test`
- [ ] Console: first 3 failures shown per suite + "+N more"
- [ ] JSON: `summary.json` contains `timestamp`, `success`, `passRate`, `totals`, `failedTests`, `suites[]`
- [ ] Markdown: numbered failure reports in `failures/{suite-name}/` with error, stack, stdout, stderr, attachments
- [ ] Timing: `timing.json` with all tests sorted by duration descending
- [ ] Timing text: per-suite `.txt` with top 30 slowest tests, top 15 files, setup/teardown overhead
- [ ] Summary log: `test-summary.log` plain text table matching console format without ANSI

---

## 7. Rollback Plan

### Prerequisites

Before deleting old scripts (Step 9), ensure you have committed them or can restore from git.

### Rollback Steps

1. **Restore old scripts from git:**
   ```bash
   git checkout HEAD -- tests/scripts/
   ```

2. **Revert package.json scripts:**
   ```bash
   git checkout HEAD -- package.json
   ```

3. **Remove testfold config (optional):**
   ```bash
   rm test-runner.config.ts
   ```

4. **Uninstall testfold (optional):**
   ```bash
   npm uninstall testfold
   ```

5. **Verify rollback:**
   ```bash
   npm test
   ```

### Rollback Timing

The migration can be performed incrementally:

| Phase | What to do | Rollback cost |
|-------|------------|---------------|
| **Phase 1**: Install testfold + create config | Both systems coexist. No risk. | Delete config file. |
| **Phase 2**: Update `package.json` scripts | Old scripts still exist. Easy revert. | `git checkout -- package.json` |
| **Phase 3**: Delete old scripts | Point of no return (unless in git). | `git checkout -- tests/scripts/` |

**Recommendation:** Complete Phase 1 and Phase 2 in one commit. Run CI. If green, delete old scripts in a separate commit (Phase 3). This allows reverting Phase 3 independently.

### Coexistence Period

During Phase 1–2, both systems can run simultaneously:

```bash
# Old system (still works)
node tests/scripts/run-all-tests.js

# New system
npx testfold
```

Compare outputs side-by-side before committing to Phase 3.
