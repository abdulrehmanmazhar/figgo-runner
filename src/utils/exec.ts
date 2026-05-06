import { execa } from "execa";

export interface ExecShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failed: boolean;
}

export async function execShell(
  command: string,
  options: { cwd: string; verbose: boolean },
): Promise<ExecShellResult> {
  const result = await execa(command, {
    shell: true,
    cwd: options.cwd,
    reject: false,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (options.verbose) {
    if (stdout.length > 0) {
      process.stdout.write(stdout);
      if (!stdout.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }
    if (stderr.length > 0) {
      process.stderr.write(stderr);
      if (!stderr.endsWith("\n")) {
        process.stderr.write("\n");
      }
    }
  }

  const exitCode = result.exitCode ?? null;
  return {
    exitCode,
    stdout,
    stderr,
    failed: exitCode !== 0,
  };
}
