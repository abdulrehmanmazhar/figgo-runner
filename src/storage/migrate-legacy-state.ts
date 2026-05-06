import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkflowStateEntry, WorkflowsStateFile } from "../core/types.js";
import { atomicWriteJson } from "./atomic-json.js";
import { getFiggoDir, getStateFilePath } from "./paths.js";

const FINGERPRINT_KEY = /^[a-f0-9]{64}$/;

function isV2Entry(value: unknown): value is WorkflowStateEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const e = value as Record<string, unknown>;
  return (
    typeof e.workflowName === "string" &&
    typeof e.workflowVersion === "string" &&
    typeof e.workflowPath === "string" &&
    typeof e.lastRun === "string" &&
    typeof e.steps === "object" &&
    e.steps !== null &&
    !Array.isArray(e.steps)
  );
}

function needsMigration(raw: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(raw)) {
    if (!FINGERPRINT_KEY.test(key)) {
      return true;
    }
    if (!isV2Entry(val)) {
      return true;
    }
  }
  return false;
}

export async function migrateAndNormalizeState(rawText: string, parsed: unknown): Promise<WorkflowsStateFile> {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const obj = parsed as Record<string, unknown>;
  if (!needsMigration(obj)) {
    return obj as WorkflowsStateFile;
  }

  const figgo = getFiggoDir();
  await mkdir(figgo, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(figgo, `workflows.pre-v2-${stamp}.bak.json`);
  await writeFile(backupPath, rawText, "utf8");
  await atomicWriteJson(getStateFilePath(), {});

  console.warn(
    `Previous workflows.json used the legacy format (workflow id keys). ` +
      `Backed up to ${backupPath}. State was reset; re-run workflows from their directories to rebuild state.`,
  );

  return {};
}
