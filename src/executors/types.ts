import type { ExecutionLogger } from "../logger/execution-logger.js";

export interface ExecutorContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  logger: ExecutionLogger;
  stepId: string;
  verbose: boolean;
  timeoutMs?: number;
}

export interface ExecutorResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failed: boolean;
}

export interface Executor {
  readonly type: string;
  run(command: string, ctx: ExecutorContext): Promise<ExecutorResult>;
  check?(command: string, ctx: ExecutorContext): Promise<ExecutorResult>;
}

