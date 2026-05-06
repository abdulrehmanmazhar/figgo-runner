import { mkdir, appendFile } from "node:fs/promises";

import { getLogsDir } from "./utils/paths.js";

function formatLine(level: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${message}\n`;
}

export class RunLogger {
  private readonly logFilePath: string;

  constructor(workflowId: string) {
    const safeTs = new Date().toISOString().replace(/[:.]/g, "-");
    this.logFilePath = `${getLogsDir()}/${workflowId}-${safeTs}.log`;
  }

  async init(): Promise<void> {
    await mkdir(getLogsDir(), { recursive: true });
  }

  get logPath(): string {
    return this.logFilePath;
  }

  private async writeFile(level: string, message: string): Promise<void> {
    await appendFile(this.logFilePath, formatLine(level, message), "utf8");
  }

  async info(message: string): Promise<void> {
    await this.writeFile("info", message);
  }

  async warn(message: string): Promise<void> {
    await this.writeFile("warn", message);
  }

  async error(message: string): Promise<void> {
    await this.writeFile("error", message);
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
