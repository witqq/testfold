/**
 * Valid custom parser - exports an object as default
 */

import type { Parser, ParseResult } from '../../../src/parsers/types.js';

const parser: Parser = {
  async parse(_jsonPath: string, _logPath?: string): Promise<ParseResult> {
    return {
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 500,
      success: true,
      failures: [],
    };
  },
};

export default parser;
