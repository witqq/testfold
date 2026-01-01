/**
 * Valid custom parser - exports via named 'parser' export
 */

import type { Parser, ParseResult } from '../../../src/parsers/types.js';

export const parser: Parser = {
  async parse(_jsonPath: string, _logPath?: string): Promise<ParseResult> {
    return {
      passed: 3,
      failed: 2,
      skipped: 1,
      duration: 750,
      success: false,
      failures: [
        {
          testName: 'Named export test 1',
          filePath: '/test/file.ts',
          error: 'Error 1',
        },
        {
          testName: 'Named export test 2',
          filePath: '/test/file.ts',
          error: 'Error 2',
        },
      ],
    };
  },
};
