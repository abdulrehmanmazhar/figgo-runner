import type { Workflow } from "../types.js";
import { sampleWorkflow } from "./sample.js";

const workflows: Record<string, Workflow> = {
  [sampleWorkflow.id]: sampleWorkflow,
};

export function getWorkflow(id: string): Workflow | undefined {
  return workflows[id];
}

export function listWorkflowIds(): string[] {
  return Object.keys(workflows).sort();
}
