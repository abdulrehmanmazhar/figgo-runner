import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { ExecutionLogger } from "../logger/execution-logger.js";
import { promptFingerprintMismatch, promptResumeOrRestart } from "../cli/prompts.js";
import { HistoryRepository } from "../storage/history-repository.js";
import {
  allStepsSuccessful,
  shouldOfferResume,
  StateRepository,
} from "../storage/state-repository.js";
import type { RunOptions, WorkflowDefinition } from "./types.js";
import type { WorkflowStateEntry, WorkflowsStateFile } from "./types.js";
import { execShell } from "../utils/exec.js";
import { resolveWorkflowDirectory } from "../utils/resolve-workflow-dir.js";
import { WorkflowFingerprintService } from "../workflow/workflow-fingerprint.js";
import { WorkflowLoader } from "../workflow/workflow-loader.js";

function pickMostRecentByLastRun(
  items: Array<{ fingerprint: string; entry: WorkflowStateEntry }>,
): { fingerprint: string; entry: WorkflowStateEntry } {
  return [...items].sort((a, b) => (a.entry.lastRun < b.entry.lastRun ? 1 : -1))[0];
}

export class WorkflowRunner {
  constructor(
    private readonly loader: WorkflowLoader,
    private readonly fingerprintService: WorkflowFingerprintService,
    private readonly stateRepo: StateRepository,
    private readonly historyRepo: HistoryRepository,
  ) {}

  async run(workflowPathArg: string, options: RunOptions, invocationCwd: string): Promise<number> {
    const abs = await resolveWorkflowDirectory(workflowPathArg, invocationCwd);
    const workflow = await this.loader.loadFromDirectory(abs);
    const fingerprint = this.fingerprintService.compute(workflow);

    const logger = new ExecutionLogger(workflow.name, fingerprint);
    await logger.init();
    logger.consoleInfo(`Log file: ${logger.logPath}`);

    await mkdir(join(abs, "data"), { recursive: true });

    const started = Date.now();
    let failedStep: string | null = null;
    let success = false;
    let exitCode = 1;

    try {
      const result = await this.executeRunLoop(workflow, abs, fingerprint, options, logger);
      exitCode = result.exitCode;
      failedStep = result.failedStep;
      success = exitCode === 0;
      return exitCode;
    } finally {
      const duration = Date.now() - started;
      try {
        await this.historyRepo.append({
          timestamp: new Date().toISOString(),
          workflowFingerprint: fingerprint,
          workflowPath: abs,
          duration,
          success,
          failedStep,
          logsPath: logger.logPath,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Could not write history: ${msg}`);
      }
    }
  }

  private async executeRunLoop(
    workflow: WorkflowDefinition,
    abs: string,
    fingerprint: string,
    options: RunOptions,
    logger: ExecutionLogger,
  ): Promise<{ exitCode: number; failedStep: string | null }> {
    let state = await this.stateRepo.load();

    if (options.reset) {
      this.stateRepo.removeEntriesForPath(state, abs);
      await logger.logMessage("INFO", "State cleared for workflow directory (--reset)");
    }

    const forPath = this.stateRepo.findEntriesForPath(state, abs);
    const stale = forPath.filter((e) => e.fingerprint !== fingerprint);

    if (stale.length > 0 && !options.reset) {
      if (options.noPrompt) {
        this.stateRepo.removeEntriesForPath(state, abs);
        await logger.logMessage(
          "INFO",
          "Workflow definition changed; auto-reset state (--no-prompt)",
        );
      } else {
        const choice = await promptFingerprintMismatch();
        if (choice === "reset") {
          this.stateRepo.removeEntriesForPath(state, abs);
          await logger.logMessage("INFO", "User chose reset after workflow definition change");
        } else {
          const donor = pickMostRecentByLastRun(stale);
          this.stateRepo.removeEntriesForPath(state, abs);
          this.stateRepo.seedEntryFromPrior(state, fingerprint, workflow, abs, donor.entry.steps);
          await logger.logMessage(
            "INFO",
            "User carried forward step state from prior definition where step ids matched",
          );
        }
      }
    }

    this.stateRepo.pruneOtherFingerprintsForPath(state, fingerprint, abs);

    let entry = this.stateRepo.ensureEntry(state, fingerprint, workflow, abs);
    entry.lastRun = new Date().toISOString();

    if (!options.reset && shouldOfferResume(workflow, entry.steps) && !options.noPrompt) {
      const choice = await promptResumeOrRestart();
      if (choice === "restart") {
        entry = this.stateRepo.resetEntry(state, fingerprint, workflow, abs);
        entry.lastRun = new Date().toISOString();
        await logger.logMessage("INFO", "User chose restart from beginning");
      } else {
        await logger.logMessage("INFO", "User chose resume");
      }
    } else if (!options.reset && shouldOfferResume(workflow, entry.steps) && options.noPrompt) {
      await logger.logMessage("INFO", "Incomplete run; auto-resuming (--no-prompt)");
    }

    const finalEntry = state[fingerprint];
    if (!finalEntry) {
      logger.consoleError("Internal error: workflow state missing.");
      await logger.logMessage("ERROR", "Workflow state missing after initialization");
      await this.stateRepo.save(state);
      return { exitCode: 1, failedStep: null };
    }

    if (allStepsSuccessful(workflow, finalEntry.steps)) {
      const msg = `Workflow "${workflow.name}" is already complete; nothing to do.`;
      logger.consoleInfo(msg);
      await logger.logMessage("INFO", msg);
      await this.stateRepo.save(state);
      return { exitCode: 0, failedStep: null };
    }

    for (const step of workflow.steps) {
      const status = finalEntry.steps[step.id];
      if (status === "success") {
        const skipMsg = `Step "${step.id}" skipped (already successful).`;
        logger.consoleInfo(skipMsg);
        await logger.logMessage("INFO", skipMsg);
        continue;
      }

      const ok = await this.runStep(step, finalEntry, state, abs, options, logger);
      if (!ok) {
        return { exitCode: 1, failedStep: step.id };
      }
    }

    const doneMsg = `Workflow "${workflow.name}" finished successfully.`;
    logger.consoleInfo(doneMsg);
    await logger.logMessage("INFO", doneMsg);
    await this.stateRepo.save(state);
    return { exitCode: 0, failedStep: null };
  }

  private async runStep(
    step: WorkflowDefinition["steps"][number],
    entry: WorkflowStateEntry,
    state: WorkflowsStateFile,
    cwd: string,
    options: RunOptions,
    logger: ExecutionLogger,
  ): Promise<boolean> {
    const t0 = Date.now();
    logger.consoleInfo(`Step "${step.id}" — ${step.description}`);
    await logger.logStepStart(step.id, step.description);

    if (step.check !== undefined) {
      await logger.logCommand(step.id, "check", step.check);
      if (options.verbose) {
        logger.consoleInfo(`$ ${step.check}`);
      }
      const checkResult = await execShell(step.check, { cwd, verbose: options.verbose });
      await logger.logExitCode(step.id, "check", checkResult.exitCode);
      await logger.logStream(step.id, "stdout", checkResult.stdout);
      await logger.logStream(step.id, "stderr", checkResult.stderr);
      if (!checkResult.failed) {
        const msg = `Step "${step.id}" satisfied by check; marking success without running main command.`;
        logger.consoleInfo(msg);
        await logger.logMessage("INFO", msg);
        entry.steps[step.id] = "success";
        await this.stateRepo.save(state);
        await logger.logStepEnd(step.id, "success", Date.now() - t0);
        return true;
      }
      await logger.logMessage("INFO", `Step "${step.id}" check did not pass; running main command.`);
    }

    await logger.logCommand(step.id, "run", step.run);
    if (options.verbose) {
      logger.consoleInfo(`$ ${step.run}`);
    }
    const runResult = await execShell(step.run, { cwd, verbose: options.verbose });
    await logger.logExitCode(step.id, "run", runResult.exitCode);
    await logger.logStream(step.id, "stdout", runResult.stdout);
    await logger.logStream(step.id, "stderr", runResult.stderr);

    if (runResult.failed) {
      entry.steps[step.id] = "failed";
      await this.stateRepo.save(state);
      const errMsg = `Step "${step.id}" failed with exit code ${String(runResult.exitCode)}.`;
      logger.consoleError(errMsg);
      if (!options.verbose && runResult.stderr.length > 0) {
        logger.consoleError(runResult.stderr.trimEnd());
      }
      await logger.logMessage("ERROR", errMsg);
      await logger.logStepEnd(step.id, "failed", Date.now() - t0);
      return false;
    }

    entry.steps[step.id] = "success";
    await this.stateRepo.save(state);
    logger.consoleInfo(`Step "${step.id}" completed successfully.`);
    await logger.logStepEnd(step.id, "success", Date.now() - t0);
    return true;
  }
}
