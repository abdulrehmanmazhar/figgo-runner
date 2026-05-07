import type { Executor } from "./types.js";

const executors = new Map<string, Executor>();

export function registerExecutor(executor: Executor): void {
  executors.set(executor.type, executor);
}

export function getExecutor(type: string): Executor {
  const exec = executors.get(type);
  if (!exec) {
    throw new Error(`No executor registered for type "${type}"`);
  }
  return exec;
}

