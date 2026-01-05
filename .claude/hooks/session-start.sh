#!/bin/bash
# Claude Code SessionStart Hook
# Runs at session initialization to set up the development environment

# ==============================================================================
# REMOTE ENVIRONMENT SETUP (Claude Code on the Web)
# ==============================================================================

if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  # Install uv if not present
  if ! command -v uv &> /dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
    export PATH="$HOME/.local/bin:$PATH"
  fi

  # Python: sync dependencies with uv
  if [ -f "pyproject.toml" ]; then
    uv sync --quiet
  elif [ -f "requirements.txt" ]; then
    uv pip install -r requirements.txt --quiet
  fi

  # Node/Frontend: install dependencies with yarn
  if [ -f "package.json" ]; then
    if [ -f "yarn.lock" ]; then
      yarn install --silent
    elif [ -f "package-lock.json" ]; then
      npm ci --silent
    else
      yarn install --silent
    fi
  fi
fi

# ==============================================================================
# PROJECT CONTEXT (runs in both local and remote)
# ==============================================================================

echo "=== Project Context ==="

# Git status summary
if git rev-parse --git-dir > /dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  echo "Branch: $BRANCH"

  echo "Recent commits:"
  git log --oneline -3 2>/dev/null || true

  # Uncommitted changes summary
  STAGED=$(git diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
  MODIFIED=$(git diff --numstat 2>/dev/null | wc -l | tr -d ' ')
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')

  if [ "$STAGED" -gt 0 ] || [ "$MODIFIED" -gt 0 ] || [ "$UNTRACKED" -gt 0 ]; then
    echo "Changes: +$STAGED staged, !$MODIFIED modified, ?$UNTRACKED untracked"
  fi
fi

# Show TODOs if present
if [ -f "TODO.md" ]; then
  echo ""
  echo "=== TODOs ==="
  head -15 TODO.md
fi

exit 0
