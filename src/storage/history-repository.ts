import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { HistoryRecord } from "../core/types.js";
import { atomicWriteJson } from "./atomic-json.js";
import { getHistoryDir } from "./paths.js";

function isHistoryRecord(value: unknown): value is HistoryRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.timestamp === "string" &&
    typeof r.workflowFingerprint === "string" &&
    typeof r.workflowPath === "string" &&
    typeof r.duration === "number" &&
    typeof r.success === "boolean" &&
    (r.failedStep === null || typeof r.failedStep === "string") &&
    typeof r.logsPath === "string"
  );
}

export class HistoryRepository {
  async append(record: HistoryRecord): Promise<string> {
    const dir = getHistoryDir();
    const safeTs = record.timestamp.replace(/[:.]/g, "-");
    const fileName = `${safeTs}-${record.workflowFingerprint.slice(0, 8)}.json`;
    const filePath = join(dir, fileName);
    await atomicWriteJson(filePath, record);
    return filePath;
  }

  async listRecent(limit: number): Promise<HistoryRecord[]> {
    const dir = getHistoryDir();
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        return [];
      }
      throw err;
    }

    const jsonFiles = names.filter((n) => n.endsWith(".json"));
    const records: HistoryRecord[] = [];
    for (const name of jsonFiles) {
      try {
        const raw = await readFile(join(dir, name), "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (isHistoryRecord(parsed)) {
          records.push(parsed);
        }
      } catch {
        /* skip corrupt */
      }
    }
    records.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return records.slice(0, limit);
  }
}
