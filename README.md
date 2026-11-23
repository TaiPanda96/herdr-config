# Agentic Coding Workflow

My personal Herdr configuration for a responsive agent sidebar, task launcher, persistent review inbox, and worktree inventory. Includes the latest local custom mods and keyboard shortcuts. Herdr supplies the built-in mods referenced by the layouts.

## Install on a new Mac

1. Install and launch Herdr once so it creates `~/.config/herdr-app`.
2. Clone and install:

   ```sh
   git clone https://github.com/TaiPanda96/herdr-config.git
   cd herdr-config
   ./install.sh
   ```

3. In Herdr, select **Agentic Coding Workflow** from the layout picker, or run:

   ```sh
   herdr-app do layout.switch '{"name":"agentic-coding-workflow"}'
   ```

The installer copies settings, keyboard shortcuts, custom layouts with previews, and custom mods. It backs up differing destination files under `~/.config/herdr-app/.herdr-config-backups/<timestamp>/` before replacing them. Identical files are skipped. Set `HERDR_APP_HOME` to use a different config directory.

The former **DX Trial** layout is now **Agentic Coding Workflow**. The `agent-sidebar` layout remains an alias for the same workflow; `agent-sidebar-original` and `agent-board` are also included. Custom mod identifiers retain their `dx-` names so existing review state and task history continue to work.

See [WORKFLOW.md](WORKFLOW.md) for shortcuts, behavior, and verification commands.

## Update this repository from this Mac

Copy the custom files listed in `install.sh`, plus workflow documentation and tests, from `~/.config/herdr-app` into this checkout. Review the diff, then commit and push. Keep live state, agent data, telemetry, and generated files out of Git.
