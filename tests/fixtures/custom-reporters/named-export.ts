/**
 * Valid custom reporter - exports via named 'reporter' export
 */

import type { Reporter } from '../../../src/reporters/types.js';

export const reporter: Reporter = {
  onStart(): void {},
  onSuiteComplete(): void {},
  async onComplete(): Promise<void> {},
};
