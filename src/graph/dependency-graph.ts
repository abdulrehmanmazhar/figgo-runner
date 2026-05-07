import type { WorkflowDefinition, WorkflowStep } from "../core/types.js";

export interface StepNode {
  id: string;
  dependsOn: string[];
  group?: string;
  step: WorkflowStep;
}

export interface ExecutionGraph {
  steps: StepNode[];
  byId: Map<string, StepNode>;
}

export function buildExecutionGraph(workflow: WorkflowDefinition): ExecutionGraph {
  const byId = new Map<string, StepNode>();

  for (const step of workflow.steps) {
    const dependsOn = step.dependsOn ?? [];
    byId.set(step.id, {
      id: step.id,
      dependsOn,
      group: step.group,
      step,
    });
  }

  for (const node of byId.values()) {
    for (const dep of node.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(`Step "${node.id}" dependsOn unknown step "${dep}"`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Cycle detected involving step "${id}"`);
    }
    visiting.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const dep of node.dependsOn) {
      dfs(dep);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const node of byId.values()) {
    dfs(node.id);
  }

  return {
    steps: workflow.steps.map((s) => byId.get(s.id)!),
    byId,
  };
}

