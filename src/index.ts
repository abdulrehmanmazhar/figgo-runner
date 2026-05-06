#!/usr/bin/env node

import { runWorkflow } from "./runner.js";
import type { RunOptions } from "./types.js";
import { getWorkflow, listWorkflowIds } from "./workflows/registry.js";

function parseArgs(argv: string[]): { command: string; workflowId?: string; options: RunOptions } {
  const options: RunOptions = { reset: false, verbose: false, noPrompt: false };
  const positional: string[] = [];
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
      positional.push(arg);
    }
  }
  const command = positional[0] ?? "";
  const workflowId = positional[1];
  return { command, workflowId, options };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { command, workflowId, options } = parseArgs(argv);

  if (command !== "run" || workflowId === undefined || workflowId.length === 0) {
    console.error("Usage: figgo-runner run <workflowId> [--reset] [--verbose] [--no-prompt]");
    const ids = listWorkflowIds();
    console.error(ids.length > 0 ? `Workflows: ${ids.join(", ")}` : "Workflows: (none registered)");
    process.exit(2);
  }

  const workflow = getWorkflow(workflowId);
  if (workflow === undefined) {
    console.error(
      `Unknown workflow "${workflowId}". Available: ${listWorkflowIds().join(", ") || "(none)"}`,
    );
    process.exit(1);
  }

  const exitCode = await runWorkflow(workflow, options, process.cwd());
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
