import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

export async function resolveWorkflowDirectory(pathArg: string, baseCwd: string): Promise<string> {
  const abs = resolve(baseCwd, pathArg);
  const s = await stat(abs);
  if (!s.isDirectory()) {
    throw new Error(`Workflow path is not a directory: ${abs}`);
  }
  await access(abs);
  return abs;
}
