#!/usr/bin/env bash
# Personal AI Assistant — Unix/macOS launcher
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prefer python3, fallback to python
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)
if [[ -z "$PYTHON" ]]; then
    echo "[ERROR] Python not found. Install Python 3.10+ from https://python.org"
    exit 1
fi

# Warn if API key missing
if [[ -z "${ANTHROPIC_API_KEY:-}" ]] && [[ ! -f ".env" ]]; then
    echo "[WARNING] ANTHROPIC_API_KEY is not set."
    echo "  export ANTHROPIC_API_KEY=sk-ant-..."
    echo "  or create a .env file with: ANTHROPIC_API_KEY=sk-ant-..."
    echo ""
fi

# Install deps on first run
if [[ ! -f ".deps_installed" ]]; then
    echo "Installing dependencies..."
    "$PYTHON" -m pip install -q -r requirements.txt
    touch .deps_installed
fi

"$PYTHON" agent.py "$@"
