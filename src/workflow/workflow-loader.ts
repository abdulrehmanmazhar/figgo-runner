import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkflowDefinition } from "../core/types.js";
import { workflowDefinitionSchema } from "./schema.js";

const WORKFLOW_FILE = "workflow.json";

export class WorkflowLoader {
  async loadFromDirectory(workflowDir: string): Promise<WorkflowDefinition> {
    const filePath = join(workflowDir, WORKFLOW_FILE);
    let rawText: string;
    try {
      rawText = await readFile(filePath, "utf8");
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        throw new Error(`Missing ${WORKFLOW_FILE} in ${workflowDir}`);
      }
      throw err;
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      throw new Error(`Invalid JSON in ${filePath}`);
    }

    const parsed = workflowDefinitionSchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new Error(`Invalid workflow: ${msg}`);
    }

    return {
      name: parsed.data.name,
      version: parsed.data.version,
      description: parsed.data.description,
      steps: parsed.data.steps.map((s) => ({
        id: s.id,
        description: s.description,
        run: s.run,
        check: s.check,
      })),
    };
  }
}
