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
npx figgo-runner inspect ./example-workflow
npx figgo-runner run ./example-workflow
npx figgo-runner list
npx figgo-runner history
npx figgo-runner init
npx figgo-runner doctor
```

`run` options:

- `--reset` — clear saved state for that workflow directory and start fresh
- `--verbose` — stream command output to the terminal
- `--no-prompt` — skip interactive prompts (resume incomplete runs; on fingerprint mismatch, resets state)

## Workflow schema

Minimal (backward compatible):

```json
{
  "name": "My workflow",
  "version": "1.0.0",
  "description": "Automate something",
  "steps": [
    { "id": "hello", "description": "Say hello", "run": "echo hello" }
  ]
}
```

Extended fields:

- `variables`: `{ "key": "value" }` used for `{{key}}` interpolation inside step fields
- Step fields (all optional unless noted):
  - `type`: executor type, currently `"shell"` (default)
  - `run`: command to execute (required)
  - `check`: command; if it succeeds, step is considered satisfied and `run` is skipped
  - `env`: environment variables to inject (merged with `process.env`, values support `{{vars}}`)
  - `dependsOn`: array of step ids; step runs only after dependencies succeed
  - `group`: steps in the same group may run in parallel once dependencies are met
  - `retry`: number of retries after a failure (e.g. `2`)
  - `timeout`: milliseconds before the command is killed (e.g. `300000`)
  - `when`: conditional execution:
    - `linux` / `macos` / `windows`
    - `command-exists:<cmd>`
    - `env:<VAR>`
    - `file-exists:<path>`

Example:

```json
{
  "name": "Deploy Atlas",
  "version": "1.0.0",
  "description": "Deploy infrastructure",
  "variables": { "appName": "atlas", "domain": "figgolabs.com" },
  "steps": [
    {
      "id": "setup",
      "description": "Setup directories",
      "type": "shell",
      "run": "mkdir -p ./apps/{{appName}}",
      "env": { "NODE_ENV": "production", "DOMAIN": "{{domain}}" }
    },
    {
      "id": "docker-build",
      "description": "Build docker image",
      "dependsOn": ["setup"],
      "group": "build",
      "retry": 2,
      "timeout": 300000,
      "when": "command-exists:docker",
      "run": "docker build -t {{appName}} ."
    }
  ]
}
```

## Workflow project layout

```text
my-workflow/
  workflow.json
  scripts/
    ...
```

Commands in `workflow.json` run with **cwd = workflow directory**, so `bash ./scripts/setup.sh` resolves correctly.

## `init`

Scaffolds a new workflow project in the current directory:

```bash
mkdir my-workflow && cd my-workflow
npx figgo-runner init
```

## `doctor`

Checks your environment and basic compatibility:

```bash
npx figgo-runner doctor
```

## State and fingerprint

- State file: `~/.figgo/workflows.json` (atomic writes)
- Keys are **SHA-256 fingerprints** of the workflow definition (name, version, description, steps), not display names
- If you change `workflow.json`, the fingerprint changes. The runner detects another state entry for the same directory and asks whether to **carry forward matching step ids** or **reset**

## History

Each `run` appends a JSON file under `~/.figgo/history/` with the legacy fields (timestamp, path, duration, success, optional `failedStep`, and `logsPath`) plus richer step records (durations, stdout/stderr, exit codes, retry count).

## Migration from earlier figgo-runner

Older releases stored state keyed by workflow id strings (for example `"sample"`). On first load, that file is **backed up** to `~/.figgo/workflows.pre-v2-<timestamp>.bak.json` and state starts empty. Re-run workflows from their directories to recreate state.

## Example

See `example-workflow/`. From the repo root:

```bash
npx figgo-runner inspect ./example-workflow
npx figgo-runner run ./example-workflow
```
