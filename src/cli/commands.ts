import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { HistoryRepository } from "../storage/history-repository.js";
import { StateRepository } from "../storage/state-repository.js";
import { resolveWorkflowDirectory } from "../utils/resolve-workflow-dir.js";
import { getFiggoDir } from "../storage/paths.js";
import { WorkflowFingerprintService } from "../workflow/workflow-fingerprint.js";
import { WorkflowLoader } from "../workflow/workflow-loader.js";
import { workflowDefinitionSchema } from "../workflow/schema.js";

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

export async function cmdInit(cwd: string): Promise<void> {
  const workflowPath = join(cwd, "workflow.json");
  const scriptsDir = join(cwd, "scripts");
  const readmePath = join(cwd, "README.md");

  await mkdir(scriptsDir, { recursive: true });

  const sampleWorkflow = {
    name: "Sample workflow",
    version: "1.0.0",
    description: "Example figgo-runner workflow",
    variables: {
      appName: "sample-app",
    },
    steps: [
      {
        id: "setup",
        description: "Create app directory",
        type: "shell",
        run: "mkdir -p ./apps/{{appName}}",
      },
    ],
  };

  await writeFile(workflowPath, `${JSON.stringify(sampleWorkflow, null, 2)}\n`, "utf8");

  const readme = `# Workflow

This directory contains a local figgo-runner workflow.

- Edit \`workflow.json\` to define steps.
- Put helper scripts under \`scripts/\`.

Run:

\`\`\`bash
figgo-runner inspect .
figgo-runner run .
\`\`\`
`;
  await writeFile(readmePath, readme, "utf8");

  console.log("Initialized figgo-runner workflow in current directory.");
}

export async function cmdDoctor(): Promise<void> {
  console.log("figgo-runner doctor");

  function check(name: string, ok: boolean, message?: string): void {
    if (ok) {
      console.log(`  [OK] ${name}`);
    } else {
      console.log(`  [FAIL] ${name}${message ? ` — ${message}` : ""}`);
    }
  }

  const nodeOk = typeof process.version === "string" && process.version.length > 0;
  check("Node.js installed", nodeOk, nodeOk ? undefined : "process.version is empty");

  if (process.platform !== "win32") {
    const bash = spawnSync("bash", ["-c", "echo"], { stdio: "ignore" });
    check("bash available", bash.status === 0);
  } else {
    check("bash available", true, "skipped on Windows");
  }

  const docker = spawnSync("docker", ["version"], { stdio: "ignore" });
  check("docker available", docker.status === 0);

  try {
    const dir = getFiggoDir();
    await mkdir(dir, { recursive: true });
    const testFile = join(dir, ".doctor-write-test");
    await writeFile(testFile, "ok", "utf8");
    await access(testFile, fsConstants.W_OK);
    check("~/.figgo writable", true);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    check("~/.figgo writable", false, msg);
  }

  const shellCmd = process.platform === "win32" ? "cmd" : "sh";
  const shellArgs = process.platform === "win32" ? ["/c", "echo test"] : ["-c", "echo test"];
  const echo = spawnSync(shellCmd, shellArgs, { stdio: "ignore" });
  check("shell commands executable", echo.status === 0);

  const sampleWorkflow = {
    name: "Doctor test",
    version: "1.0.0",
    description: "Schema compatibility check",
    steps: [{ id: "test", description: "Test", run: "echo ok" }],
  };
  const parsed = workflowDefinitionSchema.safeParse(sampleWorkflow);
  check(
    "workflow schema compatibility",
    parsed.success,
    parsed.success ? undefined : "validation failed",
  );
}

