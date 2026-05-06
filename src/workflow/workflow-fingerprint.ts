import { createHash } from "node:crypto";

import type { WorkflowDefinition } from "../core/types.js";
import { stableStringify } from "../utils/stable-stringify.js";

function fingerprintPayload(workflow: WorkflowDefinition): unknown {
  return {
    description: workflow.description,
    name: workflow.name,
    version: workflow.version,
    steps: workflow.steps.map((s) => {
      const step: Record<string, string> = {
        description: s.description,
        id: s.id,
        run: s.run,
      };
      if (s.check !== undefined) {
        step.check = s.check;
      }
      return step;
    }),
  };
}

export class WorkflowFingerprintService {
  compute(workflow: WorkflowDefinition): string {
    const payload = fingerprintPayload(workflow);
    const canonical = stableStringify(payload);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  }
}
