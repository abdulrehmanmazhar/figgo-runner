export interface Step {
  id: string;
  description: string;
  run: string;
  check?: string;
}

export interface Workflow {
  id: string;
  description: string;
  steps: Step[];
}

export type StepStatus = "pending" | "success" | "failed";

export interface WorkflowRunState {
  lastRun: string;
  steps: Record<string, StepStatus>;
}

export type WorkflowsStateFile = Record<string, WorkflowRunState>;

export interface RunOptions {
  reset: boolean;
  verbose: boolean;
  noPrompt: boolean;
}
