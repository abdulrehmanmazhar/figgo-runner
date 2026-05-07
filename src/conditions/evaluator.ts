import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { platform } from "node:os";
import { spawnSync } from "node:child_process";

import type { StepWhenCondition } from "../core/types.js";

export interface ConditionContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

function isLinux(): boolean {
  return platform() === "linux";
}

function isMacos(): boolean {
  const p = platform();
  return p === "darwin";
}

function isWindows(): boolean {
  const p = platform();
  return p === "win32";
}

async function commandExists(cmd: string, ctx: ConditionContext): Promise<boolean> {
  const shellCommand = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
  const result = spawnSync(shellCommand, {
    shell: true,
    cwd: ctx.cwd,
    env: ctx.env,
    stdio: "ignore",
  });
  return result.status === 0;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function evaluateWhen(
  when: StepWhenCondition | undefined,
  ctx: ConditionContext,
): Promise<boolean> {
  if (!when) {
    return true;
  }

  if (when === "linux") {
    return isLinux();
  }
  if (when === "macos") {
    return isMacos();
  }
  if (when === "windows") {
    return isWindows();
  }

  if (when.startsWith("command-exists:")) {
    const cmd = when.slice("command-exists:".length);
    return commandExists(cmd, ctx);
  }

  if (when.startsWith("env:")) {
    const name = when.slice("env:".length);
    return typeof ctx.env[name] === "string" && ctx.env[name]!.length > 0;
  }

  if (when.startsWith("file-exists:")) {
    const path = when.slice("file-exists:".length);
    return fileExists(path);
  }

  return true;
}

