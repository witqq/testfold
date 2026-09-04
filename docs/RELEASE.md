# Release runbook

Testfold releases bind one locally accepted npm tarball to one annotated Git tag, one GitHub Release asset, and one npm version. Build and inspect the candidate once; publication verifies and transfers those exact bytes without rebuilding them.

## One-time trusted-publisher setup

On npm, configure a trusted publisher for package `testfold` with provider GitHub Actions, owner `witqq`, repository `testfold`, and workflow filename `publish-npm.yml`. Do not create an `NPM_TOKEN` repository secret. The workflow uses a GitHub-hosted runner and the `id-token: write` permission to authenticate with OpenID Connect (OIDC).

Protect `master` after the CI workflow exists. Require the Node.js matrix and release-quality checks before merge. Repository settings are external state and are not established merely by committing these files.

## Prepare the candidate once

Work on a clean feature branch with the release version already set in `package.json` and `package-lock.json`. Update [CHANGELOG.md](../CHANGELOG.md), then run:

```sh
npm ci --no-audit --no-fund
npm run verify
git status --short
```

`npm run verify` is the complete local gate. It checks TypeScript, lint, the Testfold self-test, GitHub workflow contracts, the exact npm inventory, sensitive bytes, metadata, the CLI executable, a clean ESM consumer, and public TypeScript declarations.

The package check writes the current accepted record to `test-results/package/candidate-evidence.json`. Read its exact candidate identity:

```sh
candidate_record="$(pwd)/test-results/package/candidate-evidence.json"
candidate_path="$(node -e 'const r=require(process.argv[1]);process.stdout.write(r.tarball.path)' "$candidate_record")"
candidate_sha256="$(node -e 'const r=require(process.argv[1]);process.stdout.write(r.tarball.sha256)' "$candidate_record")"
candidate_dirty="$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.sourceDirty))' "$candidate_record")"
version="$(node -p "require('./package.json').version")"
tag="v${version}"
test -f "$candidate_path"
test "$(basename "$candidate_path")" = "testfold-${version}.tgz"
test "${#candidate_sha256}" -eq 64
test "$candidate_dirty" = "false"
```

Do not change the release commit after accepting the candidate. If repository bytes change, run the affected checks and accept a new candidate before continuing.

## Create the GitHub release

After the reviewed commit is merged and present on public `master`, create an annotated tag pointing to that exact commit. Write release notes whose final line is `[Made with Moira](https://moira-mcp.com/)`, then create a non-draft, non-prerelease GitHub Release with the accepted tarball as its only asset:

```sh
git tag -a "$tag" -m "testfold ${version}"
git push origin "$tag"
gh release create "$tag" "$candidate_path" --title "Testfold ${version}" --notes-file ./release-notes.md
```

Tags and release assets are immutable release identities. Never move a published tag or replace an asset. Historical releases through `v0.3.2` predate this single-asset contract and remain unchanged.

## Publish through GitHub Actions

Dispatch the trusted workflow on `master` with the accepted tag and SHA-256:

```sh
gh workflow run publish-npm.yml --ref master -f tag="$tag" -f sha256="$candidate_sha256"
gh run list --workflow publish-npm.yml --limit 1 --json databaseId,status,conclusion,headSha,url
gh run watch "<databaseId>" --exit-status
npm view testfold dist-tags version --json
```

The workflow requires exactly one uploaded release asset named `testfold-VERSION.tgz`, matches GitHub's asset digest to the accepted SHA-256, downloads over verified HTTPS, recomputes SHA-256, verifies package name/version/repository, and publishes the asset URL with npm OIDC. It performs no source checkout or build.

The release is complete only when the workflow succeeds and npm reports both `latest` and `version` as the released version. Do not publish locally or add an npm token as a fallback.

## Failure handling

Stop at the failed stage and repair its owning source or external configuration. Repeat that stage and every later stage affected by the change. Do not repeat earlier checks when the accepted repository bytes remain unchanged.

Never turn a failure into success by weakening digest validation, bypassing TLS, adding a long-lived token, moving a tag, replacing an asset, or publishing a separately rebuilt tarball.
