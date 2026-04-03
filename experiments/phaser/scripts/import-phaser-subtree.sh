#!/usr/bin/env bash
set -euo pipefail

REMOTE_NAME="phaser-origin"
REMOTE_URL="https://github.com/bageus/Phaser.git"
BRANCH="${1:-main}"
PREFIX="${2:-external/phaser}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit/stash changes first." >&2
  exit 1
fi

if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

echo "Fetching $REMOTE_NAME/$BRANCH ..."
git fetch "$REMOTE_NAME" "$BRANCH"

if [[ -d "$PREFIX" ]]; then
  echo "Prefix '$PREFIX' already exists. Pulling subtree updates..."
  git subtree pull --prefix="$PREFIX" "$REMOTE_NAME" "$BRANCH" --squash
else
  echo "Adding subtree into '$PREFIX' ..."
  git subtree add --prefix="$PREFIX" "$REMOTE_NAME" "$BRANCH" --squash
fi

echo "Done. Review imported files under '$PREFIX'."
