import { mkdir, appendFile } from "node:fs/promises";

import { getLogsDir } from "../storage/paths.js";

function ts(): string {
  return new Date().toISOString();
}

export class ExecutionLogger {
  private readonly logFilePath: string;

  constructor(
    private readonly workflowName: string,
    private readonly fingerprint: string,
  ) {
    const safeTs = new Date().toISOString().replace(/[:.]/g, "-");
    const fpShort = fingerprint.slice(0, 12);
    this.logFilePath = `${getLogsDir()}/${fpShort}-${safeTs}.log`;
  }

  async init(): Promise<void> {
    await mkdir(getLogsDir(), { recursive: true });
    await this.write(
      "INFO",
      `workflow="${this.workflowName}" fingerprint=${this.fingerprint} log_start`,
    );
  }

  get logPath(): string {
    return this.logFilePath;
  }

  private async write(level: string, message: string): Promise<void> {
    const line = `[${ts()}] [${level}] [workflow=${this.workflowName}] ${message}\n`;
    await appendFile(this.logFilePath, line, "utf8");
  }

  async logStepStart(stepId: string, description: string): Promise<void> {
    await this.write("INFO", `[step=${stepId}] START ${description}`);
  }

  async logCommand(stepId: string, kind: "check" | "run", command: string): Promise<void> {
    await this.write("INFO", `[step=${stepId}] COMMAND ${kind} ${command}`);
  }

  async logStream(stepId: string, stream: "stdout" | "stderr", text: string): Promise<void> {
    const level = stream === "stderr" ? "WARN" : "INFO";
    const prefix = `[step=${stepId}] [${stream}]`;
    if (text.length === 0) {
      await this.write(level, `${prefix} (empty)`);
      return;
    }
    const lines = text.split("\n");
    for (const line of lines) {
      await this.write(level, `${prefix} ${line}`);
    }
  }

  async logExitCode(stepId: string, kind: "check" | "run", code: number | null): Promise<void> {
    await this.write("INFO", `[step=${stepId}] ${kind}_exit_code=${String(code)}`);
  }

  async logStepEnd(stepId: string, outcome: "success" | "failed" | "skipped", durationMs: number): Promise<void> {
    await this.write("INFO", `[step=${stepId}] END ${outcome} duration_ms=${String(durationMs)}`);
  }

  async logMessage(level: "INFO" | "WARN" | "ERROR", message: string): Promise<void> {
    await this.write(level, message);
  }

  consoleInfo(message: string): void {
    console.log(message);
  }

  consoleWarn(message: string): void {
    console.warn(message);
  }

  consoleError(message: string): void {
    console.error(message);
  }
}
