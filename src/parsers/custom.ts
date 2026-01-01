/**
 * Custom Parser Loader
 *
 * Dynamically loads user-specified parser modules using ESM import.
 * The parser module must export a default class or object implementing the Parser interface.
 */

import { resolve, isAbsolute } from 'node:path';
import type { Parser, ParseResult } from './types.js';

/**
 * Validates that an object implements the Parser interface
 */
function isParser(obj: unknown): obj is Parser {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'parse' in obj &&
    typeof (obj as Parser).parse === 'function'
  );
}

/**
 * Load a custom parser from a file path
 *
 * @param parserPath Path to the parser module (absolute or relative to cwd)
 * @param cwd Current working directory for resolving relative paths
 * @returns Parser instance
 * @throws Error if module cannot be loaded or doesn't implement Parser interface
 */
export async function loadCustomParser(
  parserPath: string,
  cwd: string,
): Promise<Parser> {
  // Resolve path
  const absolutePath = isAbsolute(parserPath)
    ? parserPath
    : resolve(cwd, parserPath);

  // Convert to file URL for ESM import
  const fileUrl = `file://${absolutePath}`;

  let module: unknown;
  try {
    module = await import(fileUrl);
  } catch (error) {
    throw new Error(
      `Failed to load custom parser from ${parserPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Try to get parser from module exports
  const moduleObj = module as Record<string, unknown>;

  // Check for default export
  if (moduleObj.default) {
    const defaultExport = moduleObj.default;

    // If default is a class, instantiate it
    if (typeof defaultExport === 'function') {
      try {
        const instance = new (defaultExport as new () => Parser)();
        if (isParser(instance)) {
          return instance;
        }
      } catch {
        // Not a constructor, try as object
      }
    }

    // If default is already an object with parse method
    if (isParser(defaultExport)) {
      return defaultExport;
    }
  }

  // Check for named 'parser' export
  if (moduleObj.parser && isParser(moduleObj.parser)) {
    return moduleObj.parser as Parser;
  }

  // Check if module itself is a parser
  if (isParser(moduleObj)) {
    return moduleObj;
  }

  throw new Error(
    `Custom parser at ${parserPath} does not export a valid Parser interface. ` +
      `Export must have a 'parse(jsonPath: string, logPath?: string): Promise<ParseResult>' method.`,
  );
}

/**
 * Create a wrapper parser that loads the custom parser lazily
 * This allows for better error handling during suite execution
 */
export class CustomParserLoader implements Parser {
  private parserPath: string;
  private cwd: string;
  private loadedParser: Parser | null = null;

  constructor(parserPath: string, cwd: string) {
    this.parserPath = parserPath;
    this.cwd = cwd;
  }

  async parse(jsonPath: string, logPath?: string): Promise<ParseResult> {
    if (!this.loadedParser) {
      this.loadedParser = await loadCustomParser(this.parserPath, this.cwd);
    }
    return this.loadedParser.parse(jsonPath, logPath);
  }
}
