import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";

const WIN32 = process.platform === "win32";

const SCRIPT_EXTENSIONS = new Set([".sh", ".bash", ".bat", ".cmd", ".ps1"]);

const PLATFORM_EXTENSIONS = WIN32
  ? [".bat", ".cmd", ".ps1", ".sh", ".bash"]
  : [".sh", ".bash", ".bat", ".cmd"];

interface ParsedScriptInvocation {
  scriptPath: string;
  args: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function splitPathAndArgs(rest: string): ParsedScriptInvocation | null {
  const trimmed = rest.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith('"')) {
    const endQuote = trimmed.indexOf('"', 1);
    if (endQuote === -1) return null;
    return {
      scriptPath: trimmed.slice(1, endQuote),
      args: trimmed.slice(endQuote + 1).trim(),
    };
  }

  if (trimmed.startsWith("'")) {
    const endQuote = trimmed.indexOf("'", 1);
    if (endQuote === -1) return null;
    return {
      scriptPath: trimmed.slice(1, endQuote),
      args: trimmed.slice(endQuote + 1).trim(),
    };
  }

  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { scriptPath: trimmed, args: "" };
  }

  return {
    scriptPath: trimmed.slice(0, spaceIdx),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

function looksLikeScriptPath(scriptPath: string): boolean {
  const ext = extname(scriptPath).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(ext)) return true;
  return scriptPath.includes("/") || scriptPath.includes("\\") || scriptPath.startsWith(".");
}

function parseScriptInvocation(command: string): ParsedScriptInvocation | null {
  const trimmed = command.trim();

  const bashMatch = trimmed.match(/^(?:bash|sh)\s+(.+)$/i);
  if (bashMatch) {
    const parsed = splitPathAndArgs(bashMatch[1]);
    return parsed && looksLikeScriptPath(parsed.scriptPath) ? parsed : null;
  }

  const cmdMatch = trimmed.match(/^cmd(?:\.exe)?\s+\/c\s+(.+)$/i);
  if (cmdMatch) {
    const parsed = splitPathAndArgs(cmdMatch[1]);
    return parsed && looksLikeScriptPath(parsed.scriptPath) ? parsed : null;
  }

  const parsed = splitPathAndArgs(trimmed);
  if (!parsed || !looksLikeScriptPath(parsed.scriptPath)) {
    return null;
  }

  return parsed;
}

async function findScriptFile(absPath: string): Promise<string | null> {
  const ext = extname(absPath).toLowerCase();

  if (ext && SCRIPT_EXTENSIONS.has(ext)) {
    const dir = dirname(absPath);
    const name = basename(absPath, ext);

    if (WIN32 && (ext === ".sh" || ext === ".bash")) {
      for (const altExt of [".bat", ".cmd"]) {
        const alt = resolve(dir, `${name}${altExt}`);
        if (await fileExists(alt)) return alt;
      }
    }

    if (!WIN32 && (ext === ".bat" || ext === ".cmd")) {
      for (const altExt of [".sh", ".bash"]) {
        const alt = resolve(dir, `${name}${altExt}`);
        if (await fileExists(alt)) return alt;
      }
    }

    if (await fileExists(absPath)) return absPath;

    for (const altExt of PLATFORM_EXTENSIONS) {
      const alt = resolve(dir, `${name}${altExt}`);
      if (await fileExists(alt)) return alt;
    }

    return null;
  }

  for (const altExt of PLATFORM_EXTENSIONS) {
    const candidate = `${absPath}${altExt}`;
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

function quoteIfNeeded(path: string): string {
  return path.includes(" ") ? `"${path}"` : path;
}

function formatScriptCommand(scriptPath: string, args: string): string {
  const ext = extname(scriptPath).toLowerCase();
  const quoted = quoteIfNeeded(scriptPath);

  if (WIN32) {
    if (ext === ".bat" || ext === ".cmd") {
      return args.length > 0 ? `${quoted} ${args}` : quoted;
    }
    if (ext === ".ps1") {
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File ${quoted}`;
      return args.length > 0 ? `${cmd} ${args}` : cmd;
    }
    const cmd = `bash ${quoted}`;
    return args.length > 0 ? `${cmd} ${args}` : cmd;
  }

  if (ext === ".bat" || ext === ".cmd") {
    return args.length > 0 ? `cmd /c ${quoted} ${args}` : `cmd /c ${quoted}`;
  }

  const cmd = `bash ${quoted}`;
  return args.length > 0 ? `${cmd} ${args}` : cmd;
}

export async function resolveScriptCommand(command: string, cwd: string): Promise<string> {
  const parsed = parseScriptInvocation(command);
  if (!parsed) return command;

  const absPath = isAbsolute(parsed.scriptPath)
    ? parsed.scriptPath
    : resolve(cwd, parsed.scriptPath);

  const resolved = await findScriptFile(absPath);
  if (!resolved) return command;

  const displayPath = relative(cwd, resolved) || resolved;
  return formatScriptCommand(displayPath, parsed.args);
}
