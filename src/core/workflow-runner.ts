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
import type {
  HistoryRecord,
  RunOptions,
  StepLogRecord,
  WorkflowDefinition,
  WorkflowStateEntry,
  WorkflowsStateFile,
  WorkflowStep,
} from "./types.js";
import { interpolateRecord, interpolateString } from "../interpolation/interpolator.js";
import { evaluateWhen } from "../conditions/evaluator.js";
import { buildExecutionGraph } from "../graph/dependency-graph.js";
import { getExecutor } from "../executors/registry.js";
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

    const startedAt = new Date().toISOString();
    const started = Date.now();
    let failedStep: string | null = null;
    let success = false;
    let exitCode = 1;
    const stepLogs: StepLogRecord[] = [];

    try {
      const result = await this.executeRunLoop(
        workflow,
        abs,
        fingerprint,
        options,
        logger,
        stepLogs,
      );
      exitCode = result.exitCode;
      failedStep = result.failedStep;
      success = exitCode === 0;
      return exitCode;
    } finally {
      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - started;
      try {
        const history: HistoryRecord = {
          timestamp: startedAt,
          workflowFingerprint: fingerprint,
          workflowPath: abs,
          duration: durationMs,
          success,
          failedStep,
          logsPath: logger.logPath,
          workflowName: workflow.name,
          workflowVersion: workflow.version,
          startedAt,
          endedAt,
          durationMs,
          steps: stepLogs,
        };
        await this.historyRepo.append(history);
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
    stepLogs: StepLogRecord[],
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

    const graph = buildExecutionGraph(workflow);
    const runtimeStatus = new Map<string, "pending" | "running" | "success" | "failed" | "skipped">();

    for (const node of graph.steps) {
      const stored = finalEntry.steps[node.id];
      if (stored === "success") {
        runtimeStatus.set(node.id, "success");
      } else if (stored === "failed") {
        runtimeStatus.set(node.id, "failed");
      } else {
        runtimeStatus.set(node.id, "pending");
      }
    }

    let anyFailed = false;
    let firstFailedStep: string | null = null;

    while (true) {
      if (anyFailed) {
        break;
      }

      const ready = graph.steps.filter((node) => {
        const status = runtimeStatus.get(node.id);
        if (status !== "pending") return false;
        return node.dependsOn.every((dep) => runtimeStatus.get(dep) === "success");
      });

      if (ready.length === 0) {
        const remainingPending = graph.steps.filter(
          (n) => runtimeStatus.get(n.id) === "pending",
        );
        if (remainingPending.length > 0 && !anyFailed) {
          logger.consoleError(
            "No steps are ready but some remain pending; possible cycle or unsatisfied dependencies.",
          );
          await logger.logMessage(
            "ERROR",
            "No steps ready; terminating with error due to dependency issue",
          );
          return { exitCode: 1, failedStep: null };
        }
        break;
      }

      await Promise.all(
        ready.map(async (node) => {
          if (anyFailed) return;
          runtimeStatus.set(node.id, "running");
          const result = await this.runStep(
            workflow,
            node.step,
            finalEntry,
            state,
            abs,
            options,
            logger,
            stepLogs,
          );
          if (!result.ok) {
            anyFailed = true;
            if (!firstFailedStep) {
              firstFailedStep = node.id;
            }
          } else {
            runtimeStatus.set(node.id, "success");
          }
        }),
      );
    }

    if (anyFailed) {
      for (const node of graph.steps) {
        const status = runtimeStatus.get(node.id);
        if (status === "pending") {
          runtimeStatus.set(node.id, "skipped");
          finalEntry.steps[node.id] = "failed";
        }
      }
      await this.stateRepo.save(state);
      return { exitCode: 1, failedStep: firstFailedStep };
    }

    const doneMsg = `Workflow "${workflow.name}" finished successfully.`;
    logger.consoleInfo(doneMsg);
    await logger.logMessage("INFO", doneMsg);
    await this.stateRepo.save(state);
    return { exitCode: 0, failedStep: null };
  }

  private async runStep(
    workflow: WorkflowDefinition,
    step: WorkflowStep,
    entry: WorkflowStateEntry,
    state: WorkflowsStateFile,
    cwd: string,
    options: RunOptions,
    logger: ExecutionLogger,
    stepLogs: StepLogRecord[],
  ): Promise<{ ok: boolean }> {
    const stepStart = Date.now();
    const startedAt = new Date().toISOString();
    logger.consoleInfo(`Step "${step.id}" — ${step.description}`);
    await logger.logStepStart(step.id, step.description);

    const variables = workflow.variables ?? {};
    const interpolationCtx = { variables };

    const whenOk = await evaluateWhen(step.when, {
      cwd,
      env: process.env,
    });
    if (!whenOk) {
      const msg = `Step "${step.id}" skipped due to when="${step.when ?? ""}" condition.`;
      logger.consoleInfo(msg);
      await logger.logMessage("INFO", msg);
      entry.steps[step.id] = "success";
      await this.stateRepo.save(state);
      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - stepStart;
      stepLogs.push({
        stepId: step.id,
        startedAt,
        endedAt,
        durationMs,
        stdout: "",
        stderr: "",
        exitCode: 0,
        retry: 0,
      });
      await logger.logStepEnd(step.id, "skipped", durationMs);
      return { ok: true };
    }

    const baseEnv = { ...process.env };
    const stepEnvInterpolated = interpolateRecord(step.env, interpolationCtx);
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      ...(stepEnvInterpolated ?? {}),
    };

    const checkCmd = step.check ? interpolateString(step.check, interpolationCtx) : undefined;
    const runCmd = interpolateString(step.run, interpolationCtx);

    const executor = getExecutor(step.type ?? "shell");
    const timeoutMs = step.timeout;
    const maxRetries = step.retry ?? 0;

    const aggregate = {
      stdout: "",
      stderr: "",
      exitCode: 0 as number | null,
      retry: 0,
    };

    const execCtxBase = {
      cwd,
      env,
      logger,
      stepId: step.id,
      verbose: options.verbose,
      timeoutMs,
    } as const;

    const runWithLogging = async (): Promise<boolean> => {
      if (checkCmd && executor.check) {
        await logger.logCommand(step.id, "check", checkCmd);
        if (options.verbose) {
          logger.consoleInfo(`$ ${checkCmd}`);
        }
        const checkResult = await executor.check(checkCmd, execCtxBase);
        await logger.logExitCode(step.id, "check", checkResult.exitCode);
        await logger.logStream(step.id, "stdout", checkResult.stdout);
        await logger.logStream(step.id, "stderr", checkResult.stderr);
        if (!checkResult.failed) {
          const msg = `Step "${step.id}" satisfied by check; marking success without running main command.`;
          logger.consoleInfo(msg);
          await logger.logMessage("INFO", msg);
          entry.steps[step.id] = "success";
          await this.stateRepo.save(state);
          aggregate.stdout += checkResult.stdout;
          aggregate.stderr += checkResult.stderr;
          aggregate.exitCode = checkResult.exitCode;
          return true;
        }
        await logger.logMessage(
          "INFO",
          `Step "${step.id}" check did not pass; running main command.`,
        );
      }

      await logger.logCommand(step.id, "run", runCmd);
      if (options.verbose) {
        logger.consoleInfo(`$ ${runCmd}`);
      }
      const runResult = await executor.run(runCmd, execCtxBase);
      await logger.logExitCode(step.id, "run", runResult.exitCode);
      await logger.logStream(step.id, "stdout", runResult.stdout);
      await logger.logStream(step.id, "stderr", runResult.stderr);

      aggregate.stdout += runResult.stdout;
      aggregate.stderr += runResult.stderr;
      aggregate.exitCode = runResult.exitCode;

      if (runResult.failed) {
        return false;
      }
      return true;
    };

    let attempt = 0;
    let ok = false;

    while (attempt <= maxRetries) {
      aggregate.retry = attempt;
      ok = await runWithLogging();
      if (ok) break;
      attempt += 1;
      if (attempt <= maxRetries) {
        const msg = `Step "${step.id}" failed; retrying (${attempt}/${maxRetries}).`;
        logger.consoleWarn(msg);
        await logger.logMessage("WARN", msg);
      }
    }

    const durationMs = Date.now() - stepStart;
    const endedAt = new Date().toISOString();

    if (!ok) {
      entry.steps[step.id] = "failed";
      await this.stateRepo.save(state);
      const errMsg = `Step "${step.id}" failed with exit code ${String(aggregate.exitCode)}.`;
      logger.consoleError(errMsg);
      if (!options.verbose && aggregate.stderr.length > 0) {
        logger.consoleError(aggregate.stderr.trimEnd());
      }
      await logger.logMessage("ERROR", errMsg);
      await logger.logStepEnd(step.id, "failed", durationMs);
      stepLogs.push({
        stepId: step.id,
        startedAt,
        endedAt,
        durationMs,
        stdout: aggregate.stdout,
        stderr: aggregate.stderr,
        exitCode: aggregate.exitCode,
        retry: aggregate.retry,
      });
      return { ok: false };
    }

    entry.steps[step.id] = "success";
    await this.stateRepo.save(state);
    logger.consoleInfo(`Step "${step.id}" completed successfully.`);
    await logger.logStepEnd(step.id, "success", durationMs);

    stepLogs.push({
      stepId: step.id,
      startedAt,
      endedAt,
      durationMs,
      stdout: aggregate.stdout,
      stderr: aggregate.stderr,
      exitCode: aggregate.exitCode,
      retry: aggregate.retry,
    });

    return { ok: true };
  }
}
