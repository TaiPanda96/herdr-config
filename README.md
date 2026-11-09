# Herdr personal config

My Herdr defaults for a new Mac. This repository contains only the nine files I customize: settings, two layouts with previews, and two mods. Herdr supplies the other mods referenced by the layouts.

## Install on a new Mac

1. Install and launch Herdr once so it creates `~/.config/herdr-app`.
2. Clone this repository:

   ```sh
   git clone https://github.com/TaiPanda96/herdr-config.git
   cd herdr-config
   ./install.sh
   ```

3. In Herdr, switch to **agent-board** or **agent-sidebar** from the layout picker.

The installer copies only the files in this repository. If a destination file differs, it saves the previous copy under `~/.config/herdr-app/.herdr-config-backups/<timestamp>/` before replacing it. Re-running it is safe; identical files are skipped. Set `HERDR_APP_HOME` to use a different Herdr config directory.

## Update this repository from this Mac

Copy the same nine files from `~/.config/herdr-app` into this checkout, review the diff, then commit and push. Avoid adding Herdr's live state, agent data, telemetry, or generated files.

The `task-launcher` mod expects a local Git repository with a `main` branch and an installed coding agent. It creates worktrees under `~/.herdr/worktrees/`.
