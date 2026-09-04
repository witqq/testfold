import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { parseDocument } from 'yaml';

const checkout = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNode = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

const ciSource = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const publishSource = await readFile(
  new URL('../.github/workflows/publish-npm.yml', import.meta.url),
  'utf8',
);
const ci = parseWorkflow(ciSource, 'CI workflow');
const publish = parseWorkflow(publishSource, 'npm publication workflow');

assert(ci.name === 'CI', 'CI workflow name is stable');
assert(hasTrigger(ci, 'pull_request'), 'CI runs for pull requests');
assert(hasTrigger(ci, 'push'), 'CI runs for pushes to the default branch');
assert(hasTrigger(ci, 'workflow_dispatch'), 'CI supports an operator dispatch');
assertExactKeys(ci.permissions, ['contents'], 'CI permissions');
assert(ci.permissions.contents === 'read', 'CI has read-only repository permission');

const testJob = requireRecord(ci.jobs?.test, 'CI test job');
assert(testJob['runs-on'] === 'ubuntu-24.04', 'CI test job uses a GitHub-hosted runner');
assert(
  JSON.stringify(testJob.strategy?.matrix?.node) === JSON.stringify(['22.x', '24.x']),
  'CI covers every supported Node.js major',
);
assertStepUses(testJob, checkout);
assertStepUses(testJob, setupNode);
assertStepRun(testJob, 'npm ci --no-audit --no-fund');
assertStepRun(testJob, 'npm run build');
assertStepRun(testJob, 'npm test');
assertStepRun(testJob, 'npm run test:integration');

const qualityJob = requireRecord(ci.jobs?.quality, 'CI quality job');
assert(qualityJob.needs === 'test', 'release-quality checks follow runtime tests');
assertStepUses(qualityJob, checkout);
assertStepUses(qualityJob, setupNode);
assertStepRun(qualityJob, 'npm ci --no-audit --no-fund');
assertStepRun(qualityJob, 'npm run lint');
assertStepRun(qualityJob, 'npm run check:workflows');
assertStepRun(qualityJob, 'npm run pack:check');
assertPinnedActions(ci, 'CI workflow');

assert(publish.name === 'Publish npm release asset', 'publication workflow name is stable');
assertExactKeys(publish.on, ['workflow_dispatch'], 'publication triggers');
const inputs = requireRecord(publish.on.workflow_dispatch?.inputs, 'publication inputs');
assertExactKeys(inputs, ['sha256', 'tag'], 'publication inputs');
assert(inputs.tag?.required === true, 'publication requires a tag');
assert(inputs.sha256?.required === true, 'publication requires an accepted SHA-256');
assertExactKeys(publish.permissions, ['contents', 'id-token'], 'publication permissions');
assert(publish.permissions.contents === 'read', 'publication reads release metadata');
assert(publish.permissions['id-token'] === 'write', 'publication can mint an npm OIDC token');
assert(
  publish.concurrency?.['cancel-in-progress'] === false,
  'publication cannot be cancelled mid-tag',
);

const publishJob = requireRecord(publish.jobs?.publish, 'publication job');
assert(publishJob['runs-on'] === 'ubuntu-24.04', 'publication uses a GitHub-hosted runner');
assertStepUses(publishJob, setupNode);
const publishRuns = requireSteps(publishJob)
  .map((step) => step.run)
  .filter((run) => typeof run === 'string')
  .join('\n');
for (const required of [
  'npm install --global npm@11.19.1',
  'releases/tags/${tag}',
  'release.assets.length !== 1',
  'asset.digest !== `sha256:${expectedDigest}`',
  'crypto.createHash("sha256")',
  'manifest.name !== "testfold"',
  'manifest.version !== expectedVersion',
  'npm publish --access public "${asset_url}"',
]) {
  assert(publishRuns.includes(required), `publication enforces ${required}`);
}
for (const forbidden of ['actions/checkout@', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'npm run build']) {
  assert(!publishSource.includes(forbidden), `publication excludes ${forbidden}`);
}
assertPinnedActions(publish, 'publication workflow');

console.log('GitHub Actions release contracts are valid.');

function parseWorkflow(source, label) {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(
      `${label} is invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`,
    );
  }
  return requireRecord(document.toJS(), label);
}

function hasTrigger(workflow, name) {
  return Object.hasOwn(requireRecord(workflow.on, 'workflow triggers'), name);
}

function requireRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireSteps(job) {
  if (!Array.isArray(job.steps)) throw new Error('Workflow job steps must be an array.');
  return job.steps.map((step) => requireRecord(step, 'workflow step'));
}

function assertStepUses(job, expected) {
  assert(
    requireSteps(job).some((step) => step.uses === expected),
    `workflow uses ${expected}`,
  );
}

function assertStepRun(job, expected) {
  assert(
    requireSteps(job).some((step) => step.run === expected),
    `workflow runs ${expected}`,
  );
}

function assertPinnedActions(workflow, label) {
  for (const job of Object.values(requireRecord(workflow.jobs, `${label} jobs`))) {
    for (const step of requireSteps(requireRecord(job, `${label} job`))) {
      if (typeof step.uses !== 'string') continue;
      assert(
        /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u.test(step.uses),
        `${label} action ${step.uses} is pinned to a full commit SHA`,
      );
    }
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(requireRecord(value, label)).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `${label} has exact keys`,
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(`Release workflow check failed: ${message}.`);
}
