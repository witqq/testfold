/**
 * Valid custom reporter - exports an object as default
 */

import type { Reporter } from '../../../src/reporters/types.js';

const reporter: Reporter = {
  onStart(): void {},
  onSuiteComplete(): void {},
  async onComplete(): Promise<void> {},
};

export default reporter;
