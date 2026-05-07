import type { Executor, ExecutorContext, ExecutorResult } from "./types.js";
import { execShell } from "../utils/exec.js";

function prefixLines(text: string, prefix: string): string {
  if (text.length === 0) return "";
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix} ${line}` : ""))
    .join("\n");
}

async function runCommand(
  command: string,
  ctx: ExecutorContext,
  kind: "check" | "run",
): Promise<ExecutorResult> {
  const stepPrefix = `[${ctx.stepId}]`;
  const kindPrefix = `${stepPrefix} ${kind.toUpperCase()}`;

  const result = await execShell(command, {
    cwd: ctx.cwd,
    verbose: false,
    env: ctx.env,
    timeoutMs: ctx.timeoutMs,
    onStdoutChunk: (chunk) => {
      const text = prefixLines(chunk, kindPrefix);
      if (text.length > 0) {
        ctx.logger.consoleInfo(text);
      }
    },
    onStderrChunk: (chunk) => {
      const text = prefixLines(chunk, kindPrefix);
      if (text.length > 0) {
        ctx.logger.consoleError(text);
      }
    },
  });

  if (ctx.verbose && result.stdout.length > 0) {
    ctx.logger.consoleInfo(prefixLines(result.stdout, kindPrefix));
  }
  if (ctx.verbose && result.stderr.length > 0) {
    ctx.logger.consoleError(prefixLines(result.stderr, kindPrefix));
  }

  return result;
}

export class ShellExecutor implements Executor {
  readonly type = "shell";

  async run(command: string, ctx: ExecutorContext): Promise<ExecutorResult> {
    return runCommand(command, ctx, "run");
  }

  async check(command: string, ctx: ExecutorContext): Promise<ExecutorResult> {
    return runCommand(command, ctx, "check");
  }
}

