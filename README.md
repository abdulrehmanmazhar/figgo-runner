# figgo-runner

Local workflow engine: run automation defined in an external folder (`workflow.json` + scripts). State and logs live under `~/.figgo`.

## Requirements

- Node.js 20+

## Setup

```bash
npm install
npm run build
```

## Commands

```bash
node dist/index.js inspect ./example-workflow
node dist/index.js run ./example-workflow
node dist/index.js list
node dist/index.js history
```

`run` options:

- `--reset` — clear saved state for that workflow directory and start fresh
- `--verbose` — stream command output to the terminal
- `--no-prompt` — skip interactive prompts (resume incomplete runs; on fingerprint mismatch, resets state)

## Workflow project layout

```text
my-workflow/
  workflow.json
  scripts/
    ...
```

Commands in `workflow.json` run with **cwd = workflow directory**, so `bash ./scripts/setup.sh` resolves correctly.

## State and fingerprint

- State file: `~/.figgo/workflows.json` (atomic writes)
- Keys are **SHA-256 fingerprints** of the workflow definition (name, version, description, steps), not display names
- If you change `workflow.json`, the fingerprint changes. The runner detects another state entry for the same directory and asks whether to **carry forward matching step ids** or **reset**

## History

Each `run` appends a JSON file under `~/.figgo/history/` with timestamp, path, duration, success, optional `failedStep`, and `logsPath`.

## Migration from earlier figgo-runner

Older releases stored state keyed by workflow id strings (for example `"sample"`). On first load, that file is **backed up** to `~/.figgo/workflows.pre-v2-<timestamp>.bak.json` and state starts empty. Re-run workflows from their directories to recreate state.

## Example

See `example-workflow/`. From the repo root:

```bash
node dist/index.js inspect ./example-workflow
node dist/index.js run ./example-workflow
```
