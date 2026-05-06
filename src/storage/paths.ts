import { homedir } from "node:os";
import { join } from "node:path";

export function getFiggoDir(): string {
  return join(homedir(), ".figgo");
}

export function getStateFilePath(): string {
  return join(getFiggoDir(), "workflows.json");
}

export function getLogsDir(): string {
  return join(getFiggoDir(), "logs");
}

export function getHistoryDir(): string {
  return join(getFiggoDir(), "history");
}
