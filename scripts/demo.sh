#!/usr/bin/env bash
# Demo scenario for recording the README terminal cast:
#   asciinema rec demo.cast -c "bash scripts/demo.sh"     (then: agg demo.cast demo.gif)
# Self-contained: builds a throwaway project in a temp dir, walks the whole loop.
set -e
DIR=$(mktemp -d); cd "$DIR"; mkdir wiki; touch CLAUDE.md
cat > wiki/support.md <<'MD'
# Support rules

## Refund approval
<!-- akela: id=refund-approval scope=refund tier=must -->
Refunds under $25 within 14 days are approved; anything larger escalates.

## Tone
<!-- akela: id=tone scope=all tier=should -->
Be warm, be brief, never blame the customer.
MD
say() { printf '\n\033[1m$ %s\033[0m\n' "$*"; sleep 1; "$@"; sleep 2; }
say npx -y akela init --knowledge wiki
say npx -y akela index
say npx -y akela compile --activity refund --task T-101
say cat "$(npx -y akela compile --activity refund --task T-102 | head -1)"
say npx -y akela log applied WIKI-support#refund-approval
say npx -y akela log outcome --status DONE
say npx -y akela stats
