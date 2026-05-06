import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  const tmpName = `.${randomBytes(12).toString("hex")}.tmp`;
  const tmpPath = join(dir, tmpName);
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, filePath);
}
