/**
 * TestRunner - main entry point
 */

import { resolve } from 'node:path';
import type { Config, AggregatedResults } from '../config/types.js';
import { ConfigSchema, type ValidatedConfig } from '../config/schema.js';
import { loadConfig } from '../config/loader.js';
import { Orchestrator } from './orchestrator.js';
import { ConsoleReporter } from '../reporters/console.js';
import { JsonReporter } from '../reporters/json.js';
import { MarkdownReporter } from '../reporters/markdown.js';
import type { Reporter } from '../reporters/types.js';
import { cleanDir } from '../utils/files.js';

export interface RunOptions {
  /** Environment name (e.g., 'staging', 'prod') */
  env?: string;
  /** Config file path */
  configPath?: string;
  /** Working directory */
  cwd?: string;
}

export class TestRunner {
  private config: ValidatedConfig;
  private cwd: string;

  constructor(config: Config, cwd?: string) {
    // Validate config
    const result = ConfigSchema.safeParse(config);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(`Invalid config:\n${errors}`);
    }

    this.config = result.data;
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Create runner from config file
   */
  static async fromConfigFile(
    configPath?: string,
    cwd?: string,
  ): Promise<TestRunner> {
    const config = await loadConfig(configPath);
    return new TestRunner(config, cwd);
  }

  /**
   * Run tests
   * @param suiteNames - Optional list of suite names to run
   * @param options - Run options
   */
  async run(
    suiteNames?: string[],
    options: RunOptions = {},
  ): Promise<AggregatedResults> {
    const cwd = options.cwd ?? this.cwd;
    const artifactsDir = resolve(cwd, this.config.artifactsDir);

    // Clean artifacts directory
    await cleanDir(artifactsDir);

    // Create reporters
    const reporters = this.createReporters(artifactsDir);

    // Create and run orchestrator
    const orchestrator = new Orchestrator({
      config: this.config,
      reporters,
      environment: options.env,
      cwd,
    });

    return orchestrator.run(suiteNames);
  }

  private createReporters(artifactsDir: string): Reporter[] {
    const reporters: Reporter[] = [];

    for (const name of this.config.reporters) {
      switch (name) {
        case 'console':
          reporters.push(new ConsoleReporter());
          break;
        case 'json':
          reporters.push(new JsonReporter(resolve(artifactsDir, '../summary.json')));
          break;
        case 'markdown-failures':
          reporters.push(new MarkdownReporter(artifactsDir));
          break;
        default:
          // TODO: Support custom reporters
          console.warn(`Unknown reporter: ${name}`);
      }
    }

    return reporters;
  }
}
