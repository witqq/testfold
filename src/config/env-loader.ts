/**
 * Environment file loader
 * Loads .env files for specific environments using dotenv
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export interface EnvLoadResult {
  /** Loaded environment variables */
  env: Record<string, string>;
  /** Path to loaded env file (if any) */
  loadedFile?: string;
}

/**
 * Load environment-specific .env file
 * @param environment - Environment name (e.g., 'staging', 'prod')
 * @param cwd - Working directory to resolve paths from
 * @returns Loaded environment variables
 */
export function loadEnvFile(
  environment: string,
  cwd: string,
): EnvLoadResult {
  // Try common env file patterns
  const patterns = [
    `.env.${environment}`,
    `.env.${environment}.local`,
    `env/.env.${environment}`,
    `config/.env.${environment}`,
  ];

  for (const pattern of patterns) {
    const envPath = resolve(cwd, pattern);
    if (existsSync(envPath)) {
      const result = dotenvConfig({ path: envPath });
      if (!result.error && result.parsed) {
        return {
          env: result.parsed,
          loadedFile: envPath,
        };
      }
    }
  }

  // No env file found - return empty
  return { env: {} };
}

/**
 * Load env file from explicit path
 * @param envFilePath - Path to .env file
 * @param cwd - Working directory to resolve relative paths
 * @returns Loaded environment variables
 */
export function loadEnvFileFromPath(
  envFilePath: string,
  cwd: string,
): EnvLoadResult {
  const absolutePath = resolve(cwd, envFilePath);

  if (!existsSync(absolutePath)) {
    return { env: {} };
  }

  const result = dotenvConfig({ path: absolutePath });
  if (!result.error && result.parsed) {
    return {
      env: result.parsed,
      loadedFile: absolutePath,
    };
  }

  return { env: {} };
}

/**
 * Read env file content for URL extraction
 * @param envFilePath - Path to .env file
 * @param cwd - Working directory
 * @returns File content or empty string
 */
export function readEnvFileContent(
  envFilePath: string,
  cwd: string,
): string {
  const absolutePath = resolve(cwd, envFilePath);

  if (!existsSync(absolutePath)) {
    return '';
  }

  return readFileSync(absolutePath, 'utf-8');
}

/**
 * URL extraction function type
 * Receives env file content and returns extracted URL
 */
export type UrlExtractor = (envContent: string) => string | undefined;

/**
 * Extract URL from env file using extractor function
 * @param envFilePath - Path to .env file
 * @param extractor - Function to extract URL from content
 * @param cwd - Working directory
 * @returns Extracted URL or undefined
 */
export function extractUrl(
  envFilePath: string,
  extractor: UrlExtractor,
  cwd: string,
): string | undefined {
  const content = readEnvFileContent(envFilePath, cwd);
  if (!content) {
    return undefined;
  }

  return extractor(content);
}
