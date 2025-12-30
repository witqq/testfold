/**
 * Config Schema Validation using Zod
 */

import { z } from 'zod';

export const SuiteEnvironmentSchema = z.object({
  baseUrl: z.string().url(),
  envFile: z.string().optional(),
  env: z.record(z.string()).optional(),
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

export const HooksSchema = z.object({
  beforeAll: z.function().optional(),
  afterAll: z.function().optional(),
  beforeSuite: z.function().optional(),
  afterSuite: z.function().optional(),
});

export const ConfigSchema = z.object({
  artifactsDir: z.string().min(1),
  suites: z.array(SuiteSchema).min(1),
  parallel: z.boolean().optional().default(true),
  failFast: z.boolean().optional().default(false),
  reporters: z
    .array(z.string())
    .optional()
    .default(['console', 'json', 'markdown-failures']),
  hooks: HooksSchema.optional(),
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;
