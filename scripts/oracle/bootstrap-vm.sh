#!/bin/bash
# Oracle Linux / Ubuntu — Node + Playwright + scrape Betano (DOM)
set -euo pipefail

REPO="${BETANO_REPO:-https://github.com/thiagomdr/betano-monitor.git}"
EVENT_ID="${1:-88333982}"
SLUG="${2:-tembetary-independiente-fbc}"

if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y git curl
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y git curl
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - 2>/dev/null || \
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  if command -v dnf >/dev/null 2>&1; then sudo dnf install -y nodejs; else sudo apt-get install -y nodejs; fi
fi

rm -rf ~/betano-monitor
git clone --depth 1 "$REPO" ~/betano-monitor
cd ~/betano-monitor/scripts
npm ci
npx playwright install chromium --with-deps

echo "=== scrape DOM (Total de Gols) ==="
node scrape-betano-hctg.mjs "$EVENT_ID" "$SLUG"
