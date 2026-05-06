import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export type ResumeChoice = "resume" | "restart";

export async function promptResumeOrRestart(): Promise<ResumeChoice> {
  const rl = readline.createInterface({ input, output });
  try {
    const line = await rl.question(
      'Previous run is incomplete. [R]esume from next step, or restar[T] from beginning? [R/T]: ',
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
