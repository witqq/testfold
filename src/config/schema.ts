/**
 * Config Schema Validation using Zod
 */

import { z } from 'zod';

export const SuiteEnvironmentSchema = z.object({
  baseUrl: z.string().url().optional(),
  envFile: z.string().optional(),
  env: z.record(z.string()).optional(),
  urlExtractor: z
    .function()
    .args(z.string())
    .returns(z.string().optional())
    .optional(),
});

export const SuiteSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['jest', 'playwright', 'custom']),
  command: z.string().min(1),
  resultFile: z.string().min(1),
  logFile: z.string().optional(),
  timeout: z.number().positive().optional(),
  workers: z.number().positive().optional(),
  env: z.record(z.string()).optional(),
  environments: z.record(SuiteEnvironmentSchema).optional(),
  parser: z.string().optional(),
});

export const HooksSchema = z
  .object({
    beforeAll: z.function().args().returns(z.promise(z.void())).optional(),
    afterAll: z.function().args(z.any()).returns(z.promise(z.void())).optional(),
    beforeSuite: z.function().args(z.any()).returns(z.promise(z.void())).optional(),
    afterSuite: z
      .function()
      .args(z.any(), z.any())
      .returns(z.promise(z.void()))
      .optional(),
  })
  .optional();

export const ConfigSchema = z.object({
  artifactsDir: z.string().min(1),
  /** Base directory for resolving path prefixes (defaults to './tests') */
  testsDir: z.string().optional().default('./tests'),
  suites: z.array(SuiteSchema).min(1),
  parallel: z.boolean().optional().default(true),
  failFast: z.boolean().optional().default(false),
  reporters: z
    .array(z.string())
    .optional()
    .default(['console', 'json', 'markdown-failures']),
  hooks: HooksSchema,
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;
