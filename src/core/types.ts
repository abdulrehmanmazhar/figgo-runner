export type StepStatus = "pending" | "success" | "failed";

export interface WorkflowVariables {
  readonly [key: string]: string;
}

export type StepWhenCondition =
  | "linux"
  | "macos"
  | "windows"
  | `command-exists:${string}`
  | `env:${string}`
  | `file-exists:${string}`;

export interface WorkflowStep {
  readonly id: string;
  readonly description: string;
  readonly run: string;
  readonly check?: string;
  readonly type?: string;
  readonly env?: Record<string, string>;
  readonly dependsOn?: string[];
  readonly group?: string;
  readonly retry?: number;
  readonly timeout?: number;
  readonly when?: StepWhenCondition;
}

export interface WorkflowDefinition {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly variables?: WorkflowVariables;
  readonly steps: WorkflowStep[];
}

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

export interface StepLogRecord {
  stepId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  retry: number;
}

export interface HistoryRecord {
  timestamp: string;
  workflowFingerprint: string;
  workflowPath: string;
  duration: number;
  success: boolean;
  failedStep: string | null;
  logsPath: string;
  workflowName: string;
  workflowVersion: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  steps: StepLogRecord[];
}

export type FingerprintChangeChoice = "continue" | "reset";
