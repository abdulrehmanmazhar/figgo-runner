export interface WorkflowStep {
  id: string;
  description: string;
  run: string;
  check?: string;
}

export interface WorkflowDefinition {
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
}

export type StepStatus = "pending" | "success" | "failed";

export interface WorkflowStateEntry {
  workflowName: string;
  workflowVersion: string;
  workflowPath: string;
  lastRun: string;
  steps: Record<string, StepStatus>;
}

export type WorkflowsStateFile = Record<string, WorkflowStateEntry>;

export interface RunOptions {
  reset: boolean;
  verbose: boolean;
  noPrompt: boolean;
}

export interface HistoryRecord {
  timestamp: string;
  workflowFingerprint: string;
  workflowPath: string;
  /** Execution duration in milliseconds */
  duration: number;
  success: boolean;
  failedStep: string | null;
  logsPath: string;
}

export type FingerprintChangeChoice = "continue" | "reset";
