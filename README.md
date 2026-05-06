# figgo-runner

Local CLI for running step-based shell workflows with JSON state under `~/.figgo`, resume after failures, and optional idempotent `check` commands.

## Requirements

- Node.js 20+ (LTS recommended)

The bundled `scripts/*.sh` files are optional helpers for Linux/macOS; the `sample` workflow uses shell `echo` so it runs with the default OS shell.

## Setup

```bash
npm install
npm run build
```

## Usage

From the project root (so `scripts/` resolves correctly):

```bash
node dist/index.js run sample
```

Options:

- `--reset` — clear saved state for the workflow and start fresh
- `--verbose` — print full stdout/stderr from commands
- `--no-prompt` — if a previous run is incomplete, resume without asking

State file: `~/.figgo/workflows.json`  
Logs: `~/.figgo/logs/<workflowId>-<timestamp>.log`

The `data/` directory is created at runtime under the current working directory.

## Example

The `sample` workflow prints two steps, then fails on step 3. Run again and choose **Resume** (or use `--no-prompt`) to continue; use `--reset` to start over.
