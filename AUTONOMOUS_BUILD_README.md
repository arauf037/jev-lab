# JEV Flight Lab — Autonomous Cursor Build Kit

This directory contains the files needed to let Cursor autonomously build and
iterate on the JEV Flight Lab prototype.

## Files

- `PROJECT_SPEC.md` — product specification
- `TECHNICAL_IMPLEMENTATION.md` — implementation architecture
- `CURSOR_AUTONOMOUS_PROMPT.md` — master build prompt
- `.cursor/skills/jev-flight-lab-autonomous/SKILL.md` — reusable Cursor Agent Skill
- `scripts/autonomous-build.sh` — autonomous implementation/evaluation loop

## Setup

Copy these files into the root of the actual JEV Flight Lab repository:

```text
PROJECT_SPEC.md
TECHNICAL_IMPLEMENTATION.md
CURSOR_AUTONOMOUS_PROMPT.md

.cursor/
  skills/
    jev-flight-lab-autonomous/
      SKILL.md

scripts/
  autonomous-build.sh
```

Make the orchestrator executable:

```bash
chmod +x scripts/autonomous-build.sh
```

Authenticate Cursor CLI:

```bash
agent login
```

Or configure `CURSOR_API_KEY`.

Cursor documents both authentication methods for CLI use. 

## Run

From the repository root:

```bash
./scripts/autonomous-build.sh
```

Optional model:

```bash
CURSOR_MODEL="gpt-5.6" ./scripts/autonomous-build.sh
```

Optional iteration limit:

```bash
MAX_ITERATIONS=10 ./scripts/autonomous-build.sh
```

## What the orchestrator does

Each iteration runs:

```text
Cursor implementation agent
        ↓
objective npm build/lint/test
        ↓
independent Cursor evaluation agent
        ↓
fixes
        ↓
next iteration
```

The loop stops only when the evaluation agent creates:

```text
.autopilot/COMPLETE.json
```

The shell itself also performs build/lint/test checks independently of the
agent's claim.

## Autonomy

The script intentionally uses Cursor CLI headless mode with full command
execution (`--force`) and workspace trust (`--trust`).

This is appropriate for a disposable development branch/worktree where the
agent is explicitly expected to modify and run the project without asking for
approval.

Do not point it at a repository containing unrelated uncommitted work.

## Recommended usage

Start from a clean Git branch:

```bash
git checkout -b ai/jev-flight-lab
```

Then run the orchestrator.

The script does not automatically push or commit changes.

## Logs

All agent output and validation output is stored under:

```text
.autopilot/logs/
```

Examples:

```text
iteration-1-implementation.log
iteration-1-build.log
iteration-1-lint.log
iteration-1-test.log
iteration-1-evaluation.log
```

## Completion

A successful run produces:

```text
.autopilot/COMPLETE.json
.autopilot/STATUS.md
```

The application should then be reviewed once by a human before being
presented externally, particularly if real API credentials are configured.
