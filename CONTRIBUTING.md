# Contributing to Testfold

Testfold accepts focused bug fixes, tests, documentation improvements, and compatible additions to its parsers, reporters, and orchestration contracts.

## Development setup

Use Node.js 20 or newer and npm 10 or newer:

```sh
git clone https://github.com/witqq/testfold.git
cd testfold
npm ci --no-audit --no-fund
npm run verify
```

Create a feature branch rather than committing directly to `master`. Keep changes narrowly scoped, add regression coverage for behavior changes, and update permanent documentation when a public contract changes.

## Before opening a pull request

Run the complete local gate:

```sh
npm run verify
git status --short
```

`npm run verify` checks TypeScript, lint, the Testfold self-test, repository integration tests, GitHub workflow contracts, and a clean installed npm candidate. Generated evidence is written below `test-results/` and is not committed.

Describe the observable problem and result in the pull request. Include the exact command and failure when a check cannot run. Do not commit credentials, local environment files, test output, generated package candidates, or dependency caches.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md) so the report remains private until a fix is available.
