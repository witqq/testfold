# Step 2: Обновить package.json и CLI

## Status: COMPLETED

## Files Changed

### package.json
- `name`: "claude-test-runner" → "testfold"
- `bin`: "test-runner" → "testfold"
- Added `repository`: { type: "git", url: "git+https://github.com/witqq/testfold.git" }
- Added `homepage`: "https://github.com/witqq/testfold#readme"
- Added `bugs`: { url: "https://github.com/witqq/testfold/issues" }

### src/cli/index.ts
- Version output: "claude-test-runner v0.1.0" → "testfold v0.1.0"
- Help text title: "claude-test-runner" → "testfold"
- Usage examples: "test-runner" → "testfold"
- Comment: "CLI entry point for claude-test-runner" → "CLI entry point for testfold"

### src/index.ts
- Module comment: "claude-test-runner" → "testfold"

## Verification Results

1. **Build**: `npm run build` - SUCCESS (tsc completed without errors)

2. **Version output**:
   ```
   $ node dist/cli/index.js --version
   testfold v0.1.0
   ```

3. **Help output**:
   ```
   $ node dist/cli/index.js --help
   testfold - Unified test runner for Jest and Playwright

   Usage:
     testfold [suites...] [options]
   ...
   ```

4. **Tests**: 37 passed, 0 failed, 0 skipped (100% pass rate)
