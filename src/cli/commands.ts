import { HistoryRepository } from "../storage/history-repository.js";
import { StateRepository } from "../storage/state-repository.js";
import { resolveWorkflowDirectory } from "../utils/resolve-workflow-dir.js";
import { WorkflowFingerprintService } from "../workflow/workflow-fingerprint.js";
import { WorkflowLoader } from "../workflow/workflow-loader.js";

const loader = new WorkflowLoader();
const fingerprintService = new WorkflowFingerprintService();
const stateRepo = new StateRepository();
const historyRepo = new HistoryRepository();

export async function cmdInspect(workflowPathArg: string, invocationCwd: string): Promise<void> {
  const abs = await resolveWorkflowDirectory(workflowPathArg, invocationCwd);
  const workflow = await loader.loadFromDirectory(abs);
  const fingerprint = fingerprintService.compute(workflow);
  console.log("Workflow directory:", abs);
  console.log("Fingerprint (sha256):", fingerprint);
  console.log("");
  console.log(JSON.stringify(workflow, null, 2));
}

export async function cmdList(): Promise<void> {
  const state = await stateRepo.load();
  const rows = Object.entries(state).map(([fp, e]) => ({
    fingerprint: fp,
    name: e.workflowName,
    version: e.workflowVersion,
    path: e.workflowPath,
    lastRun: e.lastRun,
  }));
  rows.sort((a, b) => (a.lastRun < b.lastRun ? 1 : a.lastRun > b.lastRun ? -1 : 0));
  if (rows.length === 0) {
    console.log("No workflows in state yet.");
    return;
  }
  for (const r of rows) {
    console.log(
      `${r.fingerprint.slice(0, 12)}…  ${r.name} v${r.version}  lastRun=${r.lastRun}\n  ${r.path}`,
    );
  }
}

export async function cmdHistory(): Promise<void> {
  const items = await historyRepo.listRecent(30);
  if (items.length === 0) {
    console.log("No execution history yet.");
    return;
  }
  for (const r of items) {
    const status = r.success ? "ok" : "fail";
    const fail = r.failedStep !== null ? ` step=${r.failedStep}` : "";
    console.log(
      `${r.timestamp}  ${status}  ${String(r.duration)}ms${fail}\n  ${r.workflowPath}\n  log: ${r.logsPath}`,
    );
  }
}
