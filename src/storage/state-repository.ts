import { readFile } from "node:fs/promises";

import type { WorkflowDefinition } from "../core/types.js";
import type { StepStatus, WorkflowStateEntry, WorkflowsStateFile } from "../core/types.js";
import { atomicWriteJson } from "./atomic-json.js";
import { migrateAndNormalizeState } from "./migrate-legacy-state.js";
import { getStateFilePath } from "./paths.js";

function emptySteps(stepIds: string[]): Record<string, StepStatus> {
  const steps: Record<string, StepStatus> = {};
  for (const id of stepIds) {
    steps[id] = "pending";
  }
  return steps;
}

export class StateRepository {
  async load(): Promise<WorkflowsStateFile> {
    const path = getStateFilePath();
    try {
      const rawText = await readFile(path, "utf8");
      const parsed = JSON.parse(rawText) as unknown;
      return migrateAndNormalizeState(rawText, parsed);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        return {};
      }
      throw err;
    }
  }

  async save(state: WorkflowsStateFile): Promise<void> {
    await atomicWriteJson(getStateFilePath(), state);
  }

  findEntriesForPath(state: WorkflowsStateFile, normalizedPath: string): Array<{ fingerprint: string; entry: WorkflowStateEntry }> {
    const out: Array<{ fingerprint: string; entry: WorkflowStateEntry }> = [];
    for (const [fingerprint, entry] of Object.entries(state)) {
      if (entry.workflowPath === normalizedPath) {
        out.push({ fingerprint, entry });
      }
    }
    return out;
  }

  removeEntriesForPath(state: WorkflowsStateFile, normalizedPath: string): void {
    for (const [fingerprint, entry] of Object.entries(state)) {
      if (entry.workflowPath === normalizedPath) {
        delete state[fingerprint];
      }
    }
  }

  pruneOtherFingerprintsForPath(
    state: WorkflowsStateFile,
    keepFingerprint: string,
    normalizedPath: string,
  ): void {
    for (const [fingerprint, entry] of Object.entries(state)) {
      if (entry.workflowPath === normalizedPath && fingerprint !== keepFingerprint) {
        delete state[fingerprint];
      }
    }
  }

  ensureEntry(
    state: WorkflowsStateFile,
    fingerprint: string,
    workflow: WorkflowDefinition,
    normalizedPath: string,
  ): WorkflowStateEntry {
    const existing = state[fingerprint];
    const stepIds = workflow.steps.map((s) => s.id);
    if (!existing) {
      const entry: WorkflowStateEntry = {
        workflowName: workflow.name,
        workflowVersion: workflow.version,
        workflowPath: normalizedPath,
        lastRun: new Date().toISOString(),
        steps: emptySteps(stepIds),
      };
      state[fingerprint] = entry;
      return entry;
    }

    const merged: Record<string, StepStatus> = { ...existing.steps };
    for (const id of stepIds) {
      if (!(id in merged)) {
        merged[id] = "pending";
      }
    }
    existing.workflowName = workflow.name;
    existing.workflowVersion = workflow.version;
    existing.workflowPath = normalizedPath;
    existing.steps = merged;
    return existing;
  }

  resetEntry(state: WorkflowsStateFile, fingerprint: string, workflow: WorkflowDefinition, normalizedPath: string): WorkflowStateEntry {
    const entry: WorkflowStateEntry = {
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      workflowPath: normalizedPath,
      lastRun: new Date().toISOString(),
      steps: emptySteps(workflow.steps.map((s) => s.id)),
    };
    state[fingerprint] = entry;
    return entry;
  }

  seedEntryFromPrior(
    state: WorkflowsStateFile,
    fingerprint: string,
    workflow: WorkflowDefinition,
    normalizedPath: string,
    priorSteps: Record<string, StepStatus>,
  ): WorkflowStateEntry {
    const steps = emptySteps(workflow.steps.map((s) => s.id));
    for (const step of workflow.steps) {
      const prev = priorSteps[step.id];
      if (prev === "success" || prev === "failed") {
        steps[step.id] = prev;
      }
    }
    const entry: WorkflowStateEntry = {
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      workflowPath: normalizedPath,
      lastRun: new Date().toISOString(),
      steps,
    };
    state[fingerprint] = entry;
    return entry;
  }
}

export function allStepsSuccessful(workflow: WorkflowDefinition, steps: Record<string, StepStatus>): boolean {
  return workflow.steps.every((s) => steps[s.id] === "success");
}

export function shouldOfferResume(workflow: WorkflowDefinition, steps: Record<string, StepStatus>): boolean {
  if (allStepsSuccessful(workflow, steps)) {
    return false;
  }
  const hasFailed = workflow.steps.some((s) => steps[s.id] === "failed");
  const hasSuccess = workflow.steps.some((s) => steps[s.id] === "success");
  return hasFailed || hasSuccess;
}
