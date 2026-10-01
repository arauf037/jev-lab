#!/usr/bin/env bash
set -euo pipefail

# JEV Flight Lab Autonomous Cursor Orchestrator
#
# Usage:
#   ./scripts/autonomous-build.sh
#
# Optional:
#   MAX_ITERATIONS=8 ./scripts/autonomous-build.sh
#   CURSOR_MODEL="gpt-5.6" ./scripts/autonomous-build.sh
#
# This script intentionally runs Cursor Agent in headless/full-autonomy mode.
# It is designed for a disposable development branch/worktree.
#
# Cursor CLI currently supports headless `agent -p`, full write/shell access,
# --force/--yolo, and --trust. See:
# https://cursor.com/docs/cli/using
#
# IMPORTANT:
# Run this in a repository/branch where autonomous edits are acceptable.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MAX_ITERATIONS="${MAX_ITERATIONS:-8}"
CURSOR_MODEL="${CURSOR_MODEL:-}"
LOG_DIR="$ROOT/.autopilot/logs"
STATE_DIR="$ROOT/.autopilot"

mkdir -p "$LOG_DIR" "$STATE_DIR"

PROMPT_FILE="$ROOT/CURSOR_AUTONOMOUS_PROMPT.md"

if ! command -v agent >/dev/null 2>&1; then
  echo "ERROR: Cursor CLI 'agent' was not found."
  echo "Install/update Cursor CLI first."
  exit 1
fi

if [[ ! -f "$ROOT/PROJECT_SPEC.md" ]]; then
  echo "ERROR: PROJECT_SPEC.md not found."
  exit 1
fi

if [[ ! -f "$ROOT/TECHNICAL_IMPLEMENTATION.md" ]]; then
  echo "ERROR: TECHNICAL_IMPLEMENTATION.md not found."
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: CURSOR_AUTONOMOUS_PROMPT.md not found."
  exit 1
fi

# Never carry a stale completion signal into a new run.
rm -f "$STATE_DIR/COMPLETE.json"

run_agent() {
  local label="$1"
  local prompt="$2"
  local logfile="$LOG_DIR/${label}.log"

  echo
  echo "============================================================"
  echo "CURSOR AGENT: $label"
  echo "============================================================"

  local model_args=()
  if [[ -n "$CURSOR_MODEL" ]]; then
    model_args=(--model "$CURSOR_MODEL")
  fi

  # --print: headless/non-interactive
  # --force: Run Everything / automatic command execution
  # --trust: trust current workspace in headless mode
  #
  # Do NOT use a worktree here: this orchestrator is intended to iterate
  # against one working tree so each agent sees the previous agent's fixes.
  agent \
    -p \
    --force \
    --trust \
    "${model_args[@]}" \
    --output-format text \
    "$prompt" \
    2>&1 | tee "$logfile"
}

objective_prompt="$(cat "$PROMPT_FILE")"

echo "Repository: $ROOT"
echo "Max iterations: $MAX_ITERATIONS"
echo "Cursor model: ${CURSOR_MODEL:-default}"
echo
echo "Starting autonomous JEV Flight Lab build."

for ((iteration=1; iteration<=MAX_ITERATIONS; iteration++)); do
  echo
  echo "################################################################"
  echo "# AUTONOMOUS ITERATION $iteration / $MAX_ITERATIONS"
  echo "################################################################"

  run_agent \
    "iteration-${iteration}-implementation" \
    "$objective_prompt

AUTONOMOUS ITERATION: $iteration of $MAX_ITERATIONS.

Do not stop at analysis.

Inspect the current repository state and continue from whatever previous
iterations already implemented.

First read:
- PROJECT_SPEC.md
- TECHNICAL_IMPLEMENTATION.md
- .cursor/skills/jev-flight-lab-autonomous/SKILL.md

Then inspect the actual current implementation.

Your job in this iteration:
1. discover the highest-priority remaining problem,
2. implement the fix,
3. run relevant validation,
4. inspect the result,
5. continue fixing issues,
6. do not wait for human approval.

If the application is already mostly complete, spend this iteration on
verification and polish rather than rewriting working code.

Do not declare completion merely because files exist.

At the end, summarize:
- changes made
- checks run
- failures remaining
- whether the project is actually complete."

  # Objective shell checks outside the model.
  # These are deliberately independent of the agent's own claim.
  BUILD_STATUS="not-run"
  LINT_STATUS="not-run"
  TEST_STATUS="not-run"

  if [[ -f "$ROOT/package.json" ]]; then
    if npm run build >"$LOG_DIR/iteration-${iteration}-build.log" 2>&1; then
      BUILD_STATUS="passed"
    else
      BUILD_STATUS="failed"
    fi

    if npm run lint >"$LOG_DIR/iteration-${iteration}-lint.log" 2>&1; then
      LINT_STATUS="passed"
    else
      LINT_STATUS="failed"
    fi

    if npm run test --if-present >"$LOG_DIR/iteration-${iteration}-test.log" 2>&1; then
      TEST_STATUS="passed"
    else
      # npm --if-present normally returns success if script is absent.
      TEST_STATUS="failed"
    fi
  fi

  cat >"$STATE_DIR/iteration-${iteration}.json" <<EOF
{
  "iteration": $iteration,
  "build": "$BUILD_STATUS",
  "lint": "$LINT_STATUS",
  "tests": "$TEST_STATUS"
}
EOF

  echo
  echo "Objective validation:"
  echo "  build: $BUILD_STATUS"
  echo "  lint:  $LINT_STATUS"
  echo "  tests: $TEST_STATUS"

  # If all objective checks pass, ask a separate Cursor evaluation pass to
  # review the actual implementation against the specification.
  run_agent \
    "iteration-${iteration}-evaluation" \
    "You are the independent QA/review agent for JEV Flight Lab.

Read:
- PROJECT_SPEC.md
- TECHNICAL_IMPLEMENTATION.md
- .cursor/skills/jev-flight-lab-autonomous/SKILL.md

Do NOT blindly trust previous agent claims.

Inspect the actual repository and implementation.

Evaluate:
1. core gameplay
2. game loop
3. tactical state projection
4. Jev provider architecture
5. server-side credential handling
6. async Jev decision lifecycle
7. fallback behaviour
8. Autopilot mode
9. Manual mode
10. Lab mode
11. decision history
12. decision inspector
13. neon futuristic UI
14. optional LLM analyst
15. performance risks
16. acceptance criteria

The shell validation for this iteration is:
BUILD=$BUILD_STATUS
LINT=$LINT_STATUS
TESTS=$TEST_STATUS

If anything is incomplete, broken, misleading, fake, insecure, or materially below
the specification, DO NOT mark the project complete.

Instead:
- make the necessary fixes yourself,
- run relevant checks,
- re-evaluate.

If everything required is genuinely complete, create:
.autopilot/COMPLETE.json

with:
{
  "status": "complete",
  "build": "passed",
  "lint": "passed",
  "tests": "passed_or_not_applicable",
  "acceptanceCriteria": "passed"
}

Also update:
.autopilot/STATUS.md

Do not create COMPLETE.json merely because the build passes if the product
requirements are not satisfied."

  if [[ -f "$STATE_DIR/COMPLETE.json" ]]; then
    echo
    echo "============================================================"
    echo "AUTONOMOUS BUILD COMPLETE"
    echo "============================================================"
    cat "$STATE_DIR/COMPLETE.json"
    echo
    [[ -f "$STATE_DIR/STATUS.md" ]] && cat "$STATE_DIR/STATUS.md"
    exit 0
  fi

  echo
  echo "Iteration $iteration did not reach completion."
  echo "Continuing to next autonomous iteration."

done

echo
echo "============================================================"
echo "AUTONOMOUS RUN EXHAUSTED"
echo "============================================================"
echo "No COMPLETE.json was produced after $MAX_ITERATIONS iterations."
echo "Review logs under: $LOG_DIR"
exit 2
