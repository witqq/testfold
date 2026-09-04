# Changelog

Notable changes to Testfold are documented here. The project follows Semantic Versioning.

## Unreleased

## 0.4.1 — 2026-09-04

- Make the CLI `--no-parallel`, `--parallel`, and `--fail-fast` flags override execution policy for the current run while preserving config defaults when no override is supplied.

## 0.4.0 — 2026-09-04

- Add continuous integration, verified npm release candidates, trusted publishing through GitHub Actions, and public repository maintenance documents.
- Require Node.js 22.18.0 or newer so documented TypeScript configuration files load consistently on every supported runtime.

## 0.3.2 — 2026-09-04

- Preserve grep, file, worker, and pass-through arguments containing spaces or shell metacharacters as literal framework arguments.
- Make dry-run output mirror executable quoting.
- Test the current local package tarball instead of an older registry version.

## 0.3.1 — 2026-09-04

- Support repeated `--file` filters reliably.
- Treat missing framework result files as infrastructure failures instead of false successes.
- Make focused self-test file selection reliable.

## 0.3.0 — 2026-02-09

- Add migration features and agent-oriented console, JSON, failure, timing, and progress output.
