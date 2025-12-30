/**
 * Reporter Types
 */

import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

export interface Reporter {
  /** Called when test run starts */
  onStart(suites: Suite[]): void;

  /** Called when a suite completes */
  onSuiteComplete(suite: Suite, result: SuiteResult): void;

  /** Called when all tests complete */
  onComplete(results: AggregatedResults): Promise<void>;
}
