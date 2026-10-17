#!/bin/bash
# Counts each catalog plugin's GitHub stars into stars.json; rewrites it, with the day, only when a count changed.
# A repository GitHub does not answer for keeps its last count, or none, rather than stopping the others.
# Usage: GH_TOKEN=… scripts/stars.sh
set -euo pipefail
cd "$(dirname "$0")/.."
counts='{}'
for f in plugins/*.json; do
  [ -e "$f" ] || continue
  name=$(basename "$f" .json)
  url=$(jq -r .url "$f")
  [[ "$url" =~ ^https://github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)$ ]] || { echo "$f: not a GitHub repository" >&2; exit 1; }
  repo=${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}
  n=$(gh api "repos/$repo" --jq .stargazers_count) || n=$(jq -r --arg k "$name" '.stars[$k] // empty' stars.json 2>/dev/null) || true
  [ -n "$n" ] || { echo "$f: not counted" >&2; continue; }
  counts=$(jq -c --arg k "$name" --argjson v "$n" '.[$k] = $v' <<<"$counts")
done
[ "$(jq -c -S .stars stars.json 2>/dev/null)" = "$(jq -c -S . <<<"$counts")" ] && exit 0
jq -n -S --arg d "$(date -u +%F)" --argjson s "$counts" '{changed: $d, stars: $s}' > stars.json
