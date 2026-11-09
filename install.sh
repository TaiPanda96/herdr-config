#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_dir=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
backup_dir="$target_dir/.herdr-config-backups/$(date +%Y%m%d-%H%M%S)-$$"

for path in \
  settings.json \
  layouts/agent-board.json layouts/agent-board.svg \
  layouts/agent-sidebar.json layouts/agent-sidebar.svg \
  mods/agent-board/main.js mods/agent-board/mod.json \
  mods/task-launcher/main.js mods/task-launcher/mod.json
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
