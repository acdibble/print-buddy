#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh <major|minor|patch>"
  exit 1
fi

pnpm version "$1" -m "chore: release v%s"
git push && git push --tags
