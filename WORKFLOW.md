# Agentic Coding Workflow

The `agentic-coding-workflow` and `agent-sidebar` layouts include a responsive sidebar and a persistent review inbox. Your previous layout is preserved as `agent-sidebar-original`; select it in Settings or run:

    herdr-app do layout.switch '{"name":"agent-sidebar-original"}'

`agentic-coding-workflow` is a second copy of the responsive layout. Both refer to the same custom mods and share review state.

## Daily workflow

- **Cmd+Shift+N**: New task. Choose a short title, branch, base, and agent. Agent and base are remembered per project. Check base validates the exact commit; Fetch remotes updates remote refs only when clicked.
- **Cmd+Shift+J** or **Next**: Visit blocked agents, then tasks needing review.
- **Cmd+Shift+K** or **Worktrees**: Inspect the current repository's worktrees. Removal is temporarily disabled after a post-removal render failure. Inspection, Open, and Refresh remain available. The refresh now runs from a command handler instead of during rendering.
- **Needs review** persists after opening a task or closing its session. Choose Review to see committed-change and working-tree summaries. PR / checks uses your existing `gh` login only when clicked. Closed-session cards also have **Dismiss**, which clears the saved review without marking it reviewed, reopening a session, or deleting files. Dismissal persists across restarts. Choose Reviewed to acknowledge it; idle tasks can be queued again with Review.
- **Resume last task** reuses the last created worktree for the current project and focuses an existing agent when one is already present. It can retry startup after a launch failure.

## Open worktrees in VS Code

Click the linked folder path on an Agent Board card to open its checkout in Visual Studio Code. Idle sidebar rows have a **Code ↗** action. The clicked card determines the folder, including saved review cards; opening the editor does not select or acknowledge a session. A nested terminal directory opens the Git checkout root. Ordinary folders also work.

This macOS action checks the folder on click and uses the installed Visual Studio Code app, without requiring `code` on PATH. Missing folders and launch failures show a notification. Remote cards report that VS Code Remote is needed rather than opening a matching local path. No process or filesystem work occurs during rendering.

Run the focused link tests with:

    node --experimental-vm-modules dx-tests/editor.mjs

## Responsive layout

Widths are logical pixels, so application zoom is respected:

- Below 900: 76px sidebar rail; terminal gets the remaining width.
- 900–1199: 224px sidebar; side panel tucks away.
- 1200 and up: sidebar uses 22% of the width, bounded to 280–360px. Files/Changes uses up to 26%, bounded to 420px.

The sidebar's lists share vertical space and scroll independently. The task launcher scrolls on short windows. Font size remains your preference. Split terminals remain as arranged by you.

## Files and rollback

- `mods/dx-*`: personal mods. Herdr's shipped mods have not been edited.
- `layouts/agent-sidebar-original.json`: original layout.
- Original keys and layout: `~/.config/herdr-dx-backups/2026-11-16/`.
- Review state: `shared.json` under `dx.reviews`, with a backup in Herdr-managed `data/dx-board/`. Last launch, prompts, and project preferences: `data/dx-launcher/`. These private runtime files are excluded from Git.
- `shared.json` contains task base metadata and task instructions; it is also excluded from Git.

The custom removal mod is based on Herdr 0.1.16's worktree mod. Its delete handler is disabled; it cannot close spaces or delete files. Do not re-enable it until the complete deletion and UI lifecycle has been audited.

## Verification

Run `herdr-app check mods/<name>` for each custom mod to check its initial native render. Use the installed layout to verify later UI states.

Run the behavioral tests with:

    node --experimental-vm-modules dx-tests/workflow.mjs

The tests use disposable repositories and mocked agent startup; they cover worktree isolation, configured directories, launch recovery, duplicate-agent avoidance, review persistence, responsive sizing, removal being disabled without changing files or spaces, and render purity following a completion notification. Real project worktrees are not removed by tests.

## Removal incident

The inventory previously called reload() during render when a shared completion value changed. Reload called cx.notify(), which Herdr forbids during rendering. The regression test reproduces the old failure and passes with the refresh command handled outside render. Initial renderer checks and disposable Git tests did not cover that interaction. Removal remains disabled; passing those tests alone is insufficient to call the destructive workflow safe.
