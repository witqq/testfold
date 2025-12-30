/**
 * Config File Loader
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigSchema, type ValidatedConfig } from './schema.js';
import type { Config } from './types.js';

const CONFIG_FILES = [
  'test-runner.config.ts',
  'test-runner.config.js',
  'test-runner.config.mjs',
];

export async function loadConfig(
  configPath?: string,
): Promise<ValidatedConfig> {
  const cwd = process.cwd();

  // If explicit path provided, use it
  if (configPath) {
    const fullPath = resolve(cwd, configPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    return loadConfigFile(fullPath);
  }

  // Search for config file
  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      return loadConfigFile(fullPath);
    }
  }

  throw new Error(
    `No config file found. Create one of: ${CONFIG_FILES.join(', ')}`,
  );
}

async function loadConfigFile(path: string): Promise<ValidatedConfig> {
  const fileUrl = pathToFileURL(path).href;

  // Dynamic import for ESM/TS files
  const module = (await import(fileUrl)) as { default?: Config };

  const config = module.default;
  if (!config) {
    throw new Error(`Config file must have a default export: ${path}`);
  }

  // Validate with Zod
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid config:\n${errors}`);
  }

  return result.data;
}

/**
 * Helper to create typed config
 */
export function defineConfig(config: Config): Config {
  return config;
}
