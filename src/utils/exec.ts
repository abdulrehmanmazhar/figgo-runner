import { execa } from "execa";

export interface ExecShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failed: boolean;
}

export interface ExecShellOptions {
  cwd: string;
  verbose: boolean;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export async function execShell(
  command: string,
  options: ExecShellOptions,
): Promise<ExecShellResult> {
  const child = execa(command, {
    shell: true,
    cwd: options.cwd,
    reject: false,
    env: options.env,
    timeout: options.timeoutMs,
  });

  let stdout = "";
  let stderr = "";

  if (child.stdout) {
    child.stdout.on("data", (chunk: unknown) => {
      const text = typeof chunk === "string" ? chunk : String(chunk);
      stdout += text;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(text);
      } else if (options.verbose) {
        process.stdout.write(text);
      }
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk: unknown) => {
      const text = typeof chunk === "string" ? chunk : String(chunk);
      stderr += text;
      if (options.onStderrChunk) {
        options.onStderrChunk(text);
      } else if (options.verbose) {
        process.stderr.write(text);
      }
    });
  }

  const result = await child;
  const exitCode = result.exitCode ?? null;
  return {
    exitCode,
    stdout,
    stderr,
    failed: exitCode !== 0,
  };
}

