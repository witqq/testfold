/**
 * TestRunner - main entry point
 */

import { resolve } from 'node:path';
import type { Config, AggregatedResults } from '../config/types.js';
import { ConfigSchema, type ValidatedConfig } from '../config/schema.js';
import { loadConfig } from '../config/loader.js';
import { loadEnvFile } from '../config/env-loader.js';
import { Orchestrator } from './orchestrator.js';
import { ConsoleReporter } from '../reporters/console.js';
import { JsonReporter } from '../reporters/json.js';
import { MarkdownReporter } from '../reporters/markdown.js';
import { TimingReporter } from '../reporters/timing.js';
import { TextReporter } from '../reporters/text.js';
import type { Reporter } from '../reporters/types.js';
import { cleanSuiteArtifacts, type SuiteArtifacts } from '../utils/files.js';

export interface RunOptions {
  /** Environment name (e.g., 'staging', 'prod') */
  env?: string;
  /** Config file path */
  configPath?: string;
  /** Working directory */
  cwd?: string;
  /** Reporter override (replaces config reporters) */
  reporter?: string;
  /** Pass-through arguments appended to test commands */
  passThrough?: string[];
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

    // Load environment-specific .env file
    let envFileVars: Record<string, string> = {};
    if (options.env) {
      const envResult = loadEnvFile(options.env, cwd);
      envFileVars = envResult.env;
    }

    // Determine which suites will run
    const suitesToRun = suiteNames
      ? this.config.suites.filter(
          (s) =>
            suiteNames.includes(s.name) ||
            suiteNames.includes(s.name.toLowerCase()),
        )
      : this.config.suites;

    // Clean only artifacts for suites being run (preserves other suites' artifacts)
    const suiteArtifacts: SuiteArtifacts[] = suitesToRun.map((s) => ({
      name: s.name,
      resultFile: s.resultFile,
      logFile: s.logFile ?? s.resultFile.replace('.json', '.log'),
    }));
    await cleanSuiteArtifacts(artifactsDir, suiteArtifacts);

    // Create reporters (use override if provided)
    const reporterNames = options.reporter
      ? [options.reporter]
      : this.config.reporters;
    const reporters = this.createReporters(artifactsDir, reporterNames);

    // Create and run orchestrator
    const orchestrator = new Orchestrator({
      config: this.config,
      reporters,
      environment: options.env,
      cwd,
      passThrough: options.passThrough,
      envFileVars,
    });

    return orchestrator.run(suiteNames);
  }

  private createReporters(
    artifactsDir: string,
    reporterNames: string[],
  ): Reporter[] {
    const reporters: Reporter[] = [];
    let consoleReporter: ConsoleReporter | null = null;

    for (const name of reporterNames) {
      switch (name) {
        case 'console':
          // Console reporter added last to see all artifacts
          consoleReporter = new ConsoleReporter(artifactsDir);
          break;
        case 'json':
          reporters.push(new JsonReporter(resolve(artifactsDir, '../summary.json')));
          break;
        case 'markdown-failures':
          reporters.push(new MarkdownReporter(artifactsDir));
          break;
        case 'timing':
          reporters.push(new TimingReporter(resolve(artifactsDir, 'timing.json')));
          break;
        case 'text':
          reporters.push(new TextReporter(resolve(artifactsDir, 'results.txt')));
          break;
        default:
          // TODO: Support custom reporters
          console.warn(`Unknown reporter: ${name}`);
      }
    }

    // Add console reporter last so it can see all generated artifacts
    if (consoleReporter) {
      reporters.push(consoleReporter);
    }

    return reporters;
  }
}
