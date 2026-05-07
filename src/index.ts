#!/usr/bin/env node

import { cmdDoctor, cmdHistory, cmdInit, cmdInspect, cmdList } from "./cli/commands.js";
import type { RunOptions } from "./core/types.js";
import { WorkflowRunner } from "./core/workflow-runner.js";
import { HistoryRepository } from "./storage/history-repository.js";
import { StateRepository } from "./storage/state-repository.js";
import { WorkflowFingerprintService } from "./workflow/workflow-fingerprint.js";
import { WorkflowLoader } from "./workflow/workflow-loader.js";
import { registerExecutor } from "./executors/registry.js";
import { ShellExecutor } from "./executors/shell-executor.js";

function parseRunOptions(argv: string[]): { rest: string[]; options: RunOptions } {
  const options: RunOptions = { reset: false, verbose: false, noPrompt: false };
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg === "--reset") {
      options.reset = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--no-prompt") {
      options.noPrompt = true;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    } else {
      rest.push(arg);
    }
  }
  return { rest, options };
}

function printUsage(): void {
  console.error("Usage:");
  console.error("  figgo-runner run <workflowDir> [--reset] [--verbose] [--no-prompt]");
  console.error("  figgo-runner inspect <workflowDir>");
  console.error("  figgo-runner list");
  console.error("  figgo-runner history");
   console.error("  figgo-runner init");
   console.error("  figgo-runner doctor");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  registerExecutor(new ShellExecutor());
  if (argv.length === 0) {
    printUsage();
    process.exit(2);
  }

  const command = argv[0];
  if (command === "list") {
    await cmdList();
    return;
  }
  if (command === "history") {
    await cmdHistory();
    return;
  }

  if (command === "init") {
    await cmdInit(process.cwd());
    return;
  }

  if (command === "doctor") {
    await cmdDoctor();
    return;
  }

  if (command === "inspect") {
    const pathArg = argv[1];
    if (pathArg === undefined || pathArg.length === 0) {
      printUsage();
      process.exit(2);
    }
    await cmdInspect(pathArg, process.cwd());
    return;
  }

  if (command === "run") {
    const { rest, options } = parseRunOptions(argv.slice(1));
    const pathArg = rest[0];
    if (pathArg === undefined || pathArg.length === 0) {
      printUsage();
      process.exit(2);
    }

    const runner = new WorkflowRunner(
      new WorkflowLoader(),
      new WorkflowFingerprintService(),
      new StateRepository(),
      new HistoryRepository(),
    );
    const code = await runner.run(pathArg, options, process.cwd());
    process.exit(code);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(2);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
