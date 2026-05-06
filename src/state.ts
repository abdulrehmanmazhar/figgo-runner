import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { StepStatus, Workflow, WorkflowsStateFile } from "./types.js";
import { getFiggoDir, getStateFilePath } from "./utils/paths.js";

function emptyStepsRecord(stepIds: string[]): Record<string, StepStatus> {
  const steps: Record<string, StepStatus> = {};
  for (const id of stepIds) {
    steps[id] = "pending";
  }
  return steps;
}

export async function loadState(): Promise<WorkflowsStateFile> {
  const path = getStateFilePath();
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as WorkflowsStateFile;
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

export async function saveState(state: WorkflowsStateFile): Promise<void> {
  const dir = getFiggoDir();
  await mkdir(dir, { recursive: true });
  const path = getStateFilePath();
  const json = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(path, json, "utf8");
}

export function ensureWorkflowEntry(state: WorkflowsStateFile, workflow: Workflow): void {
  const existing = state[workflow.id];
  const stepIds = workflow.steps.map((s) => s.id);
  if (!existing) {
    state[workflow.id] = {
      lastRun: new Date().toISOString(),
      steps: emptyStepsRecord(stepIds),
    };
    return;
  }

  const mergedSteps: Record<string, StepStatus> = { ...existing.steps };
  for (const id of stepIds) {
    if (!(id in mergedSteps)) {
      mergedSteps[id] = "pending";
    }
  }
  state[workflow.id] = {
    lastRun: existing.lastRun,
    steps: mergedSteps,
  };
}

export function resetWorkflowState(state: WorkflowsStateFile, workflow: Workflow): void {
  state[workflow.id] = {
    lastRun: new Date().toISOString(),
    steps: emptyStepsRecord(workflow.steps.map((s) => s.id)),
  };
}

export function allStepsSuccessful(workflow: Workflow, steps: Record<string, StepStatus>): boolean {
  return workflow.steps.every((s) => steps[s.id] === "success");
}
