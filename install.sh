#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_dir=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
backup_dir="$target_dir/.herdr-config-backups/$(date +%Y%m%d-%H%M%S)-$$"

for path in \
  settings.json \
  keys.json \
  layouts/agent-board.json \
  layouts/agent-board.svg \
  layouts/agent-sidebar-original.json \
  layouts/agent-sidebar.json \
  layouts/agent-sidebar.svg \
  layouts/agentic-coding-workflow.json \
  layouts/agentic-coding-workflow.svg \
  mods/agent-board/main.js \
  mods/agent-board/mod.json \
  mods/dx-board/editor.js \
  mods/dx-board/main.js \
  mods/dx-board/mod.json \
  mods/dx-board/review-state.js \
  mods/dx-launcher/helpers.js \
  mods/dx-launcher/main.js \
  mods/dx-launcher/mod.json \
  mods/dx-remove/main.js \
  mods/dx-remove/mod.json \
  mods/dx-responsive/main.js \
  mods/dx-responsive/mod.json \
  mods/dx-responsive/sizing.js \
  mods/dx-review/main.js \
  mods/dx-review/mod.json \
  mods/dx-worktrees/helpers.js \
  mods/dx-worktrees/main.js \
  mods/dx-worktrees/mod.json \
  mods/task-launcher/main.js \
  mods/task-launcher/mod.json
do
  source_file="$repo_dir/$path"
  destination_file="$target_dir/$path"

  if [ -f "$destination_file" ] && cmp -s "$source_file" "$destination_file"; then
    continue
  fi

  if [ -e "$destination_file" ]; then
    mkdir -p "$backup_dir/$(dirname -- "$path")"
    cp -p "$destination_file" "$backup_dir/$path"
  fi

  mkdir -p "$(dirname -- "$destination_file")"
  cp "$source_file" "$destination_file"
  printf 'Installed %s\n' "$path"
done

if [ -d "$backup_dir" ]; then
  printf 'Previous files saved in %s\n' "$backup_dir"
fi
