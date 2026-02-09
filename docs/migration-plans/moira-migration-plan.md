> ⚠️ **DELETE THIS FILE AFTER MIGRATION IS COMPLETE**

# MCP Moira → testfold Migration Plan

## 1. Executive Summary

**Scope:** Replace all 10 test runner scripts in `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/` (plus the orchestrator `tests/run-all-tests.js`) with a single `test-runner.config.ts` file and the `testfold` CLI.

**Overall Complexity: LOW** — 33 of 48 mapped features have direct equivalents (✅ DIRECT), 12 are handled via config (⚙️ CONFIG), 2 via hooks (🔌 HOOK), 5 are partial matches (🔄 PARTIAL), and only 2 are gaps (❌ GAP: coverage hint, agent-friendly instructions — both cosmetic).

**Key Benefits:**
- **10 scripts (~2000+ lines JS) → 1 config file (~120 lines TS)** — single source of truth for all test configuration
- **Elimination of code duplication** — `stripAnsi`, `sanitizeFilename`, parser logic duplicated across 3 files become built-in
- **Built-in features Moira lacks** — process timeout with SIGKILL, fail-fast mode, hooks with guards, custom parsers/reporters, grep/filter flags, workers control, config validation via Zod
- **Declarative over imperative** — suites defined as data, not scripts
- **Per-suite artifact isolation** — running one suite doesn't destroy another's results

---

## 2. testfold.config.ts Draft

```typescript
import { defineConfig } from 'testfold';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

// ---------------------------------------------------------------------------
// Helper: parse KEY=VALUE from env file content
// ---------------------------------------------------------------------------
function parseEnvVar(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^["']|["']$/g, '');
}

// ---------------------------------------------------------------------------
// Helper: load env file and return raw content
// ---------------------------------------------------------------------------
function readEnv(filename: string): string {
  const p = resolve(process.cwd(), filename);
  if (!existsSync(p)) throw new Error(`Env file not found: ${filename}`);
  return readFileSync(p, 'utf-8');
}

// ---------------------------------------------------------------------------
// Shared environment maps
// ---------------------------------------------------------------------------

/** Environments for API tests — URL without /mcp suffix */
const apiEnvironments = {
  local: {
    envFile: '.env.local',
    urlExtractor: (content: string) => {
      const port = parseEnvVar(content, 'DOCKER_PORT');
      return port ? `http://localhost:${port}` : undefined;
    },
  },
  remote: {
    envFile: '.env.remote',
    urlExtractor: (content: string) => {
      // Remote needs both .env.local (DOCKER_PORT) and .env.remote (REMOTE_HOST)
      const localContent = readEnv('.env.local');
      const port = parseEnvVar(localContent, 'DOCKER_PORT');
      const host = parseEnvVar(content, 'REMOTE_HOST');
      return port && host ? `http://${host}:${port}` : undefined;
    },
  },
  staging: {
    envFile: '.env.staging.witqq',
    baseUrl: 'https://moira.witqq.ru',
  },
  prod: {
    envFile: '.env.production.moiraqq',
    urlExtractor: (content: string) => {
      const host = parseEnvVar(content, 'MOIRA_HOST');
      return host ? `https://${host}` : undefined;
    },
  },
};

/** Environments for MCP Tools tests — URL with /mcp suffix */
const mcpToolsEnvironments = {
  local: {
    envFile: '.env.local',
    urlExtractor: (content: string) => {
      const port = parseEnvVar(content, 'DOCKER_PORT');
      return port ? `http://localhost:${port}` : undefined;
    },
    env: {
      MCP_SERVER_URL: '', // Populated by beforeSuite hook
    },
  },
  remote: {
    envFile: '.env.remote',
    urlExtractor: (content: string) => {
      const localContent = readEnv('.env.local');
      const port = parseEnvVar(localContent, 'DOCKER_PORT');
      const host = parseEnvVar(content, 'REMOTE_HOST');
      return port && host ? `http://${host}:${port}` : undefined;
    },
    env: {
      MCP_SERVER_URL: '',
    },
  },
  staging: {
    envFile: '.env.staging.witqq',
    baseUrl: 'https://moira.witqq.ru',
    env: {
      MCP_SERVER_URL: 'https://moira.witqq.ru/mcp',
    },
  },
  prod: {
    envFile: '.env.production.moiraqq',
    urlExtractor: (content: string) => {
      const host = parseEnvVar(content, 'MOIRA_HOST');
      return host ? `https://${host}` : undefined;
    },
    env: {
      MCP_SERVER_URL: '',
    },
  },
};

/** Environments for E2E tests — same URLs as API but remote uses localhost (browser on same machine) */
const e2eEnvironments = {
  local: {
    envFile: '.env.local',
    urlExtractor: (content: string) => {
      const port = parseEnvVar(content, 'DOCKER_PORT');
      return port ? `http://localhost:${port}` : undefined;
    },
  },
  remote: {
    envFile: '.env.remote',
    urlExtractor: (content: string) => {
      // E2E remote: browser runs locally, so URL is localhost (not REMOTE_HOST)
      const localContent = readEnv('.env.local');
      const port = parseEnvVar(localContent, 'DOCKER_PORT');
      return port ? `http://localhost:${port}` : undefined;
    },
  },
  staging: {
    envFile: '.env.staging.witqq',
    baseUrl: 'https://moira.witqq.ru',
  },
  prod: {
    envFile: '.env.production.moiraqq',
    urlExtractor: (content: string) => {
      const host = parseEnvVar(content, 'MOIRA_HOST');
      return host ? `https://${host}` : undefined;
    },
  },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export default defineConfig({
  artifactsDir: './test-results/artifacts',
  testsDir: './tests',
  parallel: true,
  failFast: false,

  reporters: [
    'console',
    'json',
    'markdown-failures',
    'timing',
    'timing-text',
    'summary-log',
  ],

  hooks: {
    beforeSuite: async (suite) => {
      // Remote mode guard: ensure .env.remote exists for env-routed suites
      const env = process.env.TESTFOLD_ENV; // set by -e flag
      if (env === 'remote' && suite.environments?.remote) {
        if (!existsSync(resolve(process.cwd(), '.env.remote'))) {
          return { ok: false, error: '.env.remote file not found. Create it for remote testing.' };
        }
      }
      return { ok: true };
    },

    afterSuite: async (suite, result) => {
      // MCP Tools: set MCP_SERVER_URL = TEST_BASE_URL + /mcp
      // (handled dynamically — see mcp-tools suite env config)
    },

    afterAll: async (results) => {
      // Coverage hint (replaces parse-jest-results.js coverage detection)
      if (!results.success && existsSync(resolve(process.cwd(), 'coverage'))) {
        console.log('\n📊 Coverage reports available in coverage/ directory');
      }
    },
  },

  suites: [
    // -----------------------------------------------------------------------
    // 1. Unit Tests
    // -----------------------------------------------------------------------
    {
      name: 'unit',
      type: 'jest',
      command: 'npx jest --config=tests/config/jest.unit.config.js --json --outputFile=test-results/artifacts/unit.json',
      resultFile: 'unit.json',
      env: {
        NODE_ENV: 'test',
        NODE_OPTIONS: '--experimental-vm-modules',
      },
    },

    // -----------------------------------------------------------------------
    // 2. Workflow Tests
    // -----------------------------------------------------------------------
    {
      name: 'workflow',
      type: 'jest',
      command: 'npx jest --config=tests/config/jest.workflow.config.js --json --outputFile=test-results/artifacts/workflow.json',
      resultFile: 'workflow.json',
      env: {
        NODE_ENV: 'test',
        NODE_OPTIONS: '--experimental-vm-modules',
      },
    },

    // -----------------------------------------------------------------------
    // 3. Integration Tests
    // -----------------------------------------------------------------------
    {
      name: 'integration',
      type: 'jest',
      command: 'npx jest --config=tests/config/jest.integration.config.js --json --outputFile=test-results/artifacts/integration.json',
      resultFile: 'integration.json',
      env: {
        NODE_ENV: 'test',
        NODE_OPTIONS: '--experimental-vm-modules',
        DB_PATH: './data/test-integration.db',
        TELEGRAM_ENCRYPTION_KEY: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      },
    },

    // -----------------------------------------------------------------------
    // 4. API Tests
    // -----------------------------------------------------------------------
    {
      name: 'api',
      type: 'jest',
      command: 'npx jest --config=tests/config/jest.api.config.js --json --outputFile=test-results/artifacts/api.json',
      resultFile: 'api.json',
      env: {
        NODE_OPTIONS: '--experimental-vm-modules',
      },
      environments: apiEnvironments,
    },

    // -----------------------------------------------------------------------
    // 5. MCP Tools Tests
    // -----------------------------------------------------------------------
    {
      name: 'mcp-tools',
      type: 'jest',
      command: 'npx jest --config=tests/config/jest.mcp-tools.config.js --json --outputFile=test-results/artifacts/mcp-tools.json',
      resultFile: 'mcp-tools.json',
      env: {
        NODE_OPTIONS: '--experimental-vm-modules',
      },
      environments: mcpToolsEnvironments,
    },

    // -----------------------------------------------------------------------
    // 6. E2E Tests (Playwright)
    // -----------------------------------------------------------------------
    {
      name: 'e2e',
      type: 'playwright',
      command: 'npx playwright test --config=tests/config/playwright.config.ts --reporter=json',
      resultFile: 'e2e.json',
      environments: e2eEnvironments,
    },
  ],
});
```

### MCP Tools: Dual Env Var Handling

The `mcp-tools` suite needs both `TEST_BASE_URL` (without `/mcp`) and `MCP_SERVER_URL` (with `/mcp`). testfold auto-sets `TEST_BASE_URL` from `baseUrl` or `urlExtractor` result. For `MCP_SERVER_URL`:

**Option A — urlExtractor + beforeSuite hook (recommended):**

Add to the `beforeSuite` hook:

```typescript
beforeSuite: async (suite) => {
  if (suite.name === 'mcp-tools') {
    // After env loading, TEST_BASE_URL is already set by testfold
    const baseUrl = process.env.TEST_BASE_URL;
    if (baseUrl) {
      process.env.MCP_SERVER_URL = `${baseUrl}/mcp`;
    }
  }
  // ... existing remote guard ...
  return { ok: true };
},
```

**Option B — static env in environment configs:**

For `staging`, the URL is known: `MCP_SERVER_URL: 'https://moira.witqq.ru/mcp'`. For dynamic envs (`local`, `remote`, `prod`), the hook approach is required.

### Playwright `--outputFile` Note

Playwright's JSON reporter writes to a file configured in `playwright.config.ts` via:

```typescript
reporter: [['json', { outputFile: 'test-results/artifacts/e2e.json' }]]
```

The `--reporter=json` flag in the command may need to be adjusted depending on the existing `playwright.config.ts`. If it already has JSON reporter configured with `outputFile`, remove `--reporter=json` from the command.

---

## 3. Migration Steps (Ordered)

### Step 1: Install testfold

```bash
cd /Users/mike/WebstormProjects/mcp-moira-dev2
npm install testfold --save-dev
```

### Step 2: Create config file

Copy the config from Section 2 into:

```
/Users/mike/WebstormProjects/mcp-moira-dev2/test-runner.config.ts
```

Verify config validates:

```bash
npx testfold --help  # Confirm CLI is available
```

### Step 3: Verify Playwright JSON output path

Check `tests/config/playwright.config.ts` for existing JSON reporter configuration. Ensure the `outputFile` matches `test-results/artifacts/e2e.json`. If the config already defines `reporter: [['json', { outputFile: '...' }]]`, adjust either the config or the testfold command accordingly.

### Step 4: Test each suite individually (in order of complexity)

```bash
# Simple suites first (no env routing)
npx testfold unit
npx testfold workflow
npx testfold integration

# Env-routed suites (local first, then others)
npx testfold api -e local
npx testfold api -e staging
npx testfold mcp-tools -e local
npx testfold mcp-tools -e staging
npx testfold e2e -e local
npx testfold e2e -e staging
```

For each suite, verify:
- Exit code matches old runner (`echo $?`)
- `test-results/artifacts/{suite}.json` exists and has correct content
- `test-results/artifacts/{suite}.log` exists with command metadata header + output
- `test-results/artifacts/failures/{suite}/` has markdown reports (if failures exist)
- `test-results/artifacts/{suite}-timing.txt` exists with timing stats

### Step 5: Test full orchestration

```bash
# Compare against: node tests/run-all-tests.js -- --env local
npx testfold -e local

# Compare against: node tests/run-all-tests.js -- --env remote
npx testfold -e remote
```

Verify:
- All 6 suites run in parallel
- Summary table matches (pass/fail/skip counts)
- `test-results/artifacts/test-summary.log` exists
- `summary.json` exists at project root
- `test-results/artifacts/timing.json` exists

### Step 6: Update package.json scripts

See Section 5 for exact before/after.

### Step 7: Run full test suite via new npm scripts

```bash
npm test                    # All suites, remote env
npm run test:local          # All suites, local env
npm run test:unit           # Unit only
npm run test:api:staging    # API against staging
```

### Step 8: Remove old scripts

After all suites verified:

```bash
rm tests/scripts/detect-test-env.js
rm tests/scripts/parse-jest-results.js
rm tests/scripts/parse-playwright-results.js
rm tests/scripts/run-unit-tests.js
rm tests/scripts/run-workflow-tests.js
rm tests/scripts/run-integration-tests.js
rm tests/scripts/run-api-tests.js
rm tests/scripts/run-mcp-tools-tests.js
rm tests/scripts/run-e2e-tests.js
rm tests/run-all-tests.js
```

Verify the `tests/scripts/` directory is empty (or remove it if nothing else remains).

### Step 9: Final validation

```bash
npm test          # Full suite runs clean
npm run test:unit # Individual suite still works
```

---

## 4. Gaps and Workarounds

| # | Gap | Impact | Workaround | Effort |
|---|-----|--------|------------|--------|
| 1 | **Coverage report detection** — Moira's Jest parser checks for `coverage/` dir and prints hint | Low — cosmetic hint, not core functionality | `afterAll` hook: `if (!results.success && existsSync('coverage')) console.log(...)` — already included in config draft | ~3 lines |
| 2 | **Agent-friendly failure instructions** — Moira prints structured box with paths to `.md` failure reports and AI agent instructions | Low-Medium — useful for AI workflows, not for manual testing | **Option A:** Custom reporter that prints agent instructions in `onComplete()` when `!results.success`. **Option B:** `afterAll` hook with formatted console output. **Option C:** defer to Phase 2 — testfold ConsoleReporter already shows failure reports + artifact inventory | ~30 lines (custom reporter) |
| 3 | **`envExplicit` tracking** — Moira tracks whether `--env` was explicitly passed | Low — used only for validation messages in callers | Not needed: testfold uses `undefined` when no `-e` flag; callers can check `process.env.TESTFOLD_ENV` | None needed |
| 4 | **Remote dual env file loading** — Moira loads `.env.local` then `.env.remote` with override | Low — handled in `urlExtractor` by reading `.env.local` explicitly | Already implemented in config draft: `urlExtractor` reads `.env.local` content directly via `readEnv()` helper | 0 (done) |
| 5 | **`--headed` as first-class CLI flag** — Moira strips `--headed` from args | Low — testfold passes it via `--` separator | Usage: `npx testfold e2e -- --headed` | None needed |
| 6 | **Zero-test: skip vs crash distinction** — Moira distinguishes "no tests matched filter" (skip) from "framework crashed" (fail) | Low — edge case behavior | testfold treats both as success with 0 counts. If needed, `afterSuite` hook can check `result.passed === 0 && result.failed === 0` and apply custom logic | ~5 lines (optional) |
| 7 | **MCP_SERVER_URL dual env var** — Moira sets both `MCP_SERVER_URL` (with `/mcp`) and `TEST_BASE_URL` (without `/mcp`) | Medium — required for MCP tools tests | `beforeSuite` hook sets `MCP_SERVER_URL = TEST_BASE_URL + '/mcp'` after testfold sets `TEST_BASE_URL`. Already detailed in config draft | ~5 lines |
| 8 | **Default env `local`** — Moira defaults to `local` when no `--env` provided | Low — behavior change: testfold requires explicit `-e local` | Update npm scripts to always include `-e` flag (see Section 5). Alternatively, add `beforeAll` hook: `if (!process.env.TESTFOLD_ENV) process.env.TESTFOLD_ENV = 'local'` | Script change only |

---

## 5. package.json Scripts Updates

### Before (current Moira scripts)

```json
{
  "scripts": {
    "test": "node tests/run-all-tests.js -- --env remote",
    "test:local": "node tests/run-all-tests.js -- --env local",
    "test:unit": "node tests/scripts/run-unit-tests.js",
    "test:workflow": "node tests/scripts/run-workflow-tests.js",
    "test:integration": "node tests/scripts/run-integration-tests.js",
    "test:api": "node tests/scripts/run-api-tests.js --env remote",
    "test:api:local": "node tests/scripts/run-api-tests.js --env local",
    "test:api:staging": "node tests/scripts/run-api-tests.js --env staging",
    "test:api:prod": "node tests/scripts/run-api-tests.js --env prod",
    "test:mcp-tools": "node tests/scripts/run-mcp-tools-tests.js --env remote",
    "test:mcp-tools:local": "node tests/scripts/run-mcp-tools-tests.js --env local",
    "test:mcp-tools:staging": "node tests/scripts/run-mcp-tools-tests.js --env staging",
    "test:mcp-tools:prod": "node tests/scripts/run-mcp-tools-tests.js --env prod",
    "test:e2e": "node tests/scripts/run-e2e-tests.js --env remote",
    "test:e2e:local": "node tests/scripts/run-e2e-tests.js --env local",
    "test:e2e:staging": "node tests/scripts/run-e2e-tests.js --env staging",
    "test:e2e:prod": "node tests/scripts/run-e2e-tests.js --env prod"
  }
}
```

### After (testfold)

```json
{
  "scripts": {
    "test": "testfold -e remote",
    "test:local": "testfold -e local",
    "test:unit": "testfold unit",
    "test:workflow": "testfold workflow",
    "test:integration": "testfold integration",
    "test:api": "testfold api -e remote",
    "test:api:local": "testfold api -e local",
    "test:api:staging": "testfold api -e staging",
    "test:api:prod": "testfold api -e prod",
    "test:mcp-tools": "testfold mcp-tools -e remote",
    "test:mcp-tools:local": "testfold mcp-tools -e local",
    "test:mcp-tools:staging": "testfold mcp-tools -e staging",
    "test:mcp-tools:prod": "testfold mcp-tools -e prod",
    "test:e2e": "testfold e2e -e remote",
    "test:e2e:local": "testfold e2e -e local",
    "test:e2e:staging": "testfold e2e -e staging",
    "test:e2e:prod": "testfold e2e -e prod"
  }
}
```

### Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| All-suites command | `node tests/run-all-tests.js -- --env remote` | `testfold -e remote` |
| Single suite | `node tests/scripts/run-unit-tests.js` | `testfold unit` |
| Env-routed suite | `node tests/scripts/run-api-tests.js --env staging` | `testfold api -e staging` |
| Pass-through args | `npm run test:unit -- my-test` | `npm run test:unit -- -- my-test` (double `--` needed with npm) |
| Pass-through alt | — | `npx testfold unit -- my-test` (single `--` with npx) |

### Note on pass-through args with npm

When using `npm run`, npm consumes the first `--` separator. To pass args through to testfold's `--` separator:

```bash
# Direct testfold:
npx testfold unit -- auth

# Via npm script (double --):
npm run test:unit -- -- auth

# Or use npx directly:
npx testfold unit -- auth
```

---

## 6. Verification Checklist

### Functional Verification

- [ ] **All 6 suites run** — `npx testfold -e local` completes with results for unit, workflow, integration, api, mcp-tools, e2e
- [ ] **Individual suite run** — `npx testfold unit` runs only unit tests
- [ ] **Exit codes match** — failed tests → exit 1; all pass → exit 0
- [ ] **Parallel execution** — all 6 suites start concurrently (check log timestamps)

### Artifact Verification

- [ ] **Result JSON** — `test-results/artifacts/{suite}.json` exists for each suite with correct parser output
- [ ] **Log files** — `test-results/artifacts/{suite}.log` exists with command, exit code, duration, output
- [ ] **Failure reports** — `test-results/artifacts/failures/{suite}/*.md` generated for failing tests with correct format (hierarchy, error, stack, stdout, stderr, attachments for Playwright)
- [ ] **Timing text** — `test-results/artifacts/{suite}-timing.txt` exists with top 30 tests + top 15 files
- [ ] **Timing JSON** — `test-results/artifacts/timing.json` exists with all tests sorted by duration
- [ ] **Summary JSON** — `summary.json` exists at project root with totals, suites, pass rate
- [ ] **Summary log** — `test-results/artifacts/test-summary.log` exists with ANSI-stripped table

### Environment Routing Verification

- [ ] **Local env** — `testfold api -e local` loads `.env.local`, constructs `http://localhost:{DOCKER_PORT}`
- [ ] **Remote env** — `testfold api -e remote` loads `.env.remote`, checks file exists, constructs URL with `REMOTE_HOST`
- [ ] **Staging env** — `testfold api -e staging` uses `https://moira.witqq.ru`
- [ ] **Prod env** — `testfold api -e prod` loads `.env.production.moiraqq`, extracts `MOIRA_HOST`
- [ ] **MCP Tools dual var** — `testfold mcp-tools -e local` sets both `TEST_BASE_URL` and `MCP_SERVER_URL` (with `/mcp`)
- [ ] **E2E remote localhost** — `testfold e2e -e remote` uses `localhost` URL (not `REMOTE_HOST`)
- [ ] **No env flag** — `testfold unit` runs without environment routing (no error)
- [ ] **No env for env-routed suite** — `testfold api` (no `-e`) behaves correctly (either skips env routing or uses default)

### Console Output Verification

- [ ] **Summary table** — suite names, passed/failed/skipped/time columns, totals row, pass rate
- [ ] **Pass/fail banner** — ✓ ALL TESTS PASSED or ✗ TESTS FAILED
- [ ] **Failure details** — first 3 failures shown with hierarchy and error snippet
- [ ] **Artifact inventory** — list of generated files shown at end

### Edge Case Verification

- [ ] **Single test file** — `npx testfold unit -- auth` resolves `auth` to `tests/unit/auth.test.ts`
- [ ] **Headed mode** — `npx testfold e2e -e local -- --headed` passes `--headed` to Playwright
- [ ] **Zero tests matched** — returns success with 0 counts (no crash)
- [ ] **Framework crash** — detected and reported with error snippet from log
- [ ] **Per-suite cleanup** — running `npx testfold unit` does not delete `api.json` or other suites' artifacts

---

## 7. Rollback Plan

### Preparation (before migration)

1. **Keep old scripts on a branch:**

   ```bash
   git checkout -b backup/pre-testfold-migration
   git push origin backup/pre-testfold-migration
   ```

2. **Do migration on a feature branch:**

   ```bash
   git checkout master
   git checkout -b feature/testfold-migration
   ```

### Rollback (if issues found)

1. **Immediate rollback — revert package.json scripts:**

   ```bash
   git checkout master -- package.json
   npm install
   ```

   Old scripts are still present in `tests/scripts/` until Step 8 of migration.

2. **Full rollback — abandon migration branch:**

   ```bash
   git checkout master
   git branch -D feature/testfold-migration
   ```

3. **Partial rollback — keep testfold for some suites:**

   Keep both systems running side by side. Example: use testfold for simple suites (unit, workflow, integration) and old scripts for complex ones (api, mcp-tools, e2e) until all gaps are resolved.

   ```json
   {
     "test:unit": "testfold unit",
     "test:api": "node tests/scripts/run-api-tests.js --env remote"
   }
   ```

### Rollback Triggers

- Any suite produces different pass/fail counts than old runner
- Environment routing fails to set correct URLs
- Artifact format differs in ways that break downstream tools (CI, AI agents)
- `MCP_SERVER_URL` not set correctly for mcp-tools tests

### Post-Rollback Diagnosis

If rollback is needed, capture:
1. testfold version (`npx testfold --version`)
2. Config validation output (`npx testfold --help` to verify CLI works)
3. Diff of artifacts between old and new runners
4. Full test-summary.log from both runs
