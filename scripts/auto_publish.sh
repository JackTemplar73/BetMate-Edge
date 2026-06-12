#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/jjak/Documents/Codex/2026-06-12/this-document-outlines-the-end-to"
LOG_FILE="$REPO_DIR/.auto-publish.log"
LOCK_DIR="/tmp/betmate-edge-auto-publish.lock"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT

cd "$REPO_DIR"

# Debounce file saves so one Codex edit becomes one commit.
sleep 6

if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

git add index.html CNAME src data db .gitignore scripts

if git diff --cached --quiet; then
  exit 0
fi

STAMP="$(date '+%Y-%m-%d %H:%M:%S %Z')"
git commit -m "Auto update BetMate Edge dashboard - $STAMP"
git push origin main

{
  printf '[%s] Published dashboard update\n' "$STAMP"
  git log --oneline -1
} >> "$LOG_FILE"
