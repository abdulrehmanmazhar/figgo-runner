import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { FingerprintChangeChoice } from "../core/types.js";

export type ResumeChoice = "resume" | "restart";

export async function promptResumeOrRestart(): Promise<ResumeChoice> {
  const rl = readline.createInterface({ input, output });
  try {
    const line = await rl.question(
      "Previous run is incomplete. [R]esume from next step, or restar[T] from beginning? [R/T]: ",
    );
    const normalized = line.trim().toLowerCase();
    if (normalized === "t" || normalized === "restart" || normalized === "start over") {
      return "restart";
    }
    return "resume";
  } finally {
    rl.close();
  }
}

export async function promptFingerprintMismatch(): Promise<FingerprintChangeChoice> {
  const rl = readline.createInterface({ input, output });
  try {
    const line = await rl.question(
      "Workflow definition changed (fingerprint mismatch).\n" +
        "  [1] Continue — reuse step status for matching step ids\n" +
        "  [2] Reset — clear all state for this workflow directory\n" +
        "Choose 1 or 2: ",
    );
    const n = line.trim();
    if (n === "2" || n.toLowerCase() === "reset") {
      return "reset";
    }
    return "continue";
  } finally {
    rl.close();
  }
}
