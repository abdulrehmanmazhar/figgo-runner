import { mkdir } from "node:fs/promises";

import { RunLogger } from "./logger.js";
import { promptResumeOrRestart } from "./prompt.js";
import {
  allStepsSuccessful,
  ensureWorkflowEntry,
  loadState,
  resetWorkflowState,
  saveState,
} from "./state.js";
import type { RunOptions, Step, StepStatus, Workflow, WorkflowsStateFile } from "./types.js";
import { execShell } from "./utils/exec.js";
import { getDataDir } from "./utils/paths.js";

function shouldOfferResume(workflow: Workflow, steps: Record<string, StepStatus>): boolean {
  if (allStepsSuccessful(workflow, steps)) {
    return false;
  }
  const hasFailed = workflow.steps.some((s) => steps[s.id] === "failed");
  const hasSuccess = workflow.steps.some((s) => steps[s.id] === "success");
  return hasFailed || hasSuccess;
}

export async function runWorkflow(workflow: Workflow, options: RunOptions, cwd: string): Promise<number> {
  const logger = new RunLogger(workflow.id);
  await logger.init();
  await logger.info(`Starting workflow "${workflow.id}" (cwd=${cwd})`);
  logger.consoleInfo(`Log file: ${logger.logPath}`);

  await mkdir(getDataDir(cwd), { recursive: true });

  let state = await loadState();
  ensureWorkflowEntry(state, workflow);

  if (options.reset) {
    resetWorkflowState(state, workflow);
    await logger.info("State reset via --reset");
  }

  const entry = state[workflow.id];
  if (!entry) {
    logger.consoleError("Internal error: workflow state missing after initialization.");
    await logger.error("Workflow state missing after initialization");
    return 1;
  }

  entry.lastRun = new Date().toISOString();

  if (!options.reset && shouldOfferResume(workflow, entry.steps) && !options.noPrompt) {
    const choice = await promptResumeOrRestart();
    if (choice === "restart") {
      resetWorkflowState(state, workflow);
      const refreshed = state[workflow.id];
      if (!refreshed) {
        logger.consoleError("Internal error: workflow state missing after restart.");
        return 1;
      }
      refreshed.lastRun = new Date().toISOString();
      await logger.info("User chose restart from beginning");
    } else {
      await logger.info("User chose resume");
    }
  } else if (!options.reset && shouldOfferResume(workflow, entry.steps) && options.noPrompt) {
    await logger.info("Incomplete run detected; auto-resuming (--no-prompt)");
  }

  const finalEntry = state[workflow.id];
  if (!finalEntry) {
    logger.consoleError("Internal error: workflow state missing.");
    return 1;
  }

  if (allStepsSuccessful(workflow, finalEntry.steps)) {
    const msg = `Workflow "${workflow.id}" is already complete; nothing to do.`;
    logger.consoleInfo(msg);
    await logger.info(msg);
    await saveState(state);
    return 0;
  }

  for (const step of workflow.steps) {
    const status = finalEntry.steps[step.id];
    if (status === "success") {
      const skipMsg = `Step "${step.id}" skipped (already successful).`;
      logger.consoleInfo(skipMsg);
      await logger.info(skipMsg);
      continue;
    }

    const ran = await runStep(step, finalEntry, state, cwd, options, logger);
    if (!ran) {
      return 1;
    }
  }

  const doneMsg = `Workflow "${workflow.id}" finished successfully.`;
  logger.consoleInfo(doneMsg);
  await logger.info(doneMsg);
  return 0;
}

async function runStep(
  step: Step,
  entry: { lastRun: string; steps: Record<string, StepStatus> },
  state: WorkflowsStateFile,
  cwd: string,
  options: RunOptions,
  logger: RunLogger,
): Promise<boolean> {
  const startMsg = `Step "${step.id}" — ${step.description}`;
  logger.consoleInfo(startMsg);
  await logger.info(startMsg);

  if (step.check) {
    await logger.info(`Check: ${step.check}`);
    if (options.verbose) {
      logger.consoleInfo(`$ ${step.check}`);
    }
    const checkResult = await execShell(step.check, { cwd, verbose: options.verbose });
    await logger.info(`Check exit code: ${String(checkResult.exitCode)}`);
    if (!checkResult.failed) {
      const msg = `Step "${step.id}" satisfied by check; marking success without running main command.`;
      logger.consoleInfo(msg);
      await logger.info(msg);
      entry.steps[step.id] = "success";
      await saveState(state);
      return true;
    }
    await logger.info("Check did not pass; continuing to main command.");
  }

  await logger.info(`Run: ${step.run}`);
  if (options.verbose) {
    logger.consoleInfo(`$ ${step.run}`);
  }

  const runResult = await execShell(step.run, { cwd, verbose: options.verbose });
  await logger.info(`Run exit code: ${String(runResult.exitCode)}`);
  if (runResult.stdout.length > 0) {
    await logger.info(`stdout:\n${runResult.stdout}`);
  }
  if (runResult.stderr.length > 0) {
    await logger.info(`stderr:\n${runResult.stderr}`);
  }

  if (runResult.failed) {
    entry.steps[step.id] = "failed";
    await saveState(state);
    const errMsg = `Step "${step.id}" failed with exit code ${String(runResult.exitCode)}.`;
    logger.consoleError(errMsg);
    if (!options.verbose && runResult.stderr.length > 0) {
      logger.consoleError(runResult.stderr.trimEnd());
    }
    await logger.error(errMsg);
    return false;
  }

  entry.steps[step.id] = "success";
  await saveState(state);
  const okMsg = `Step "${step.id}" completed successfully.`;
  logger.consoleInfo(okMsg);
  await logger.info(okMsg);
  return true;
}
