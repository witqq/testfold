/**
 * Valid custom reporter - exports a class as default
 */

import type { Reporter } from '../../../src/reporters/types.js';

export default class MyCustomReporter implements Reporter {
  public calls: string[] = [];

  onStart(): void {
    this.calls.push('onStart');
  }

  onSuiteComplete(): void {
    this.calls.push('onSuiteComplete');
  }

  async onComplete(): Promise<void> {
    this.calls.push('onComplete');
  }
}
