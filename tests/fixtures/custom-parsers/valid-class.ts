/**
 * Valid custom parser - exports a class as default
 */

import type { Parser, ParseResult } from '../../../src/parsers/types.js';

export default class MyCustomParser implements Parser {
  async parse(jsonPath: string, _logPath?: string): Promise<ParseResult> {
    return {
      passed: 5,
      failed: 1,
      skipped: 2,
      duration: 1000,
      success: false,
      failures: [
        {
          testName: 'Custom parser test',
          filePath: jsonPath,
          error: 'Test error from custom parser',
        },
      ],
    };
  }
}
