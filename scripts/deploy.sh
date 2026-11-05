#!/usr/bin/env bash
# Runs on the server. Usage: deploy.sh <app folder> <commit> <pm2 process>...
# Stops at the first failure, so the running app is only restarted after a good build.
set -euo pipefail

main() {
  local app_dir="$1"
  local commit="$2"
  shift 2

  # Non-interactive SSH shells often skip the profile that puts nvm's node and pm2 on PATH.
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
  fi

  cd "$app_dir"
  git fetch origin main
  if ! git merge-base --is-ancestor HEAD "$commit"; then
    echo "The server has commits that are not in $commit, so the deploy stopped." >&2
    exit 1
  fi
  git merge --ff-only "$commit"

  # The build needs dev dependencies even when the server sets NODE_ENV=production.
  npm ci --include=dev
  npm run setup
  npm run build
  pm2 restart "$@"
  echo "Deployed $commit"
}

# This script arrives on stdin, so commands must not read from it.
main "$@" </dev/null
