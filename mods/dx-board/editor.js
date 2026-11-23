// Open only the clicked card's local checkout. Arguments never pass through a shell.
export async function openInVSCode(agent, exec) {
  if (agent.machine) throw new Error("This worktree is on another machine. Open it with VS Code Remote on that machine.");
  const folder = agent.folder;
  if (typeof folder !== "string" || !folder.startsWith("/")) throw new Error("This session has no local worktree path.");
  const options = { timeout: 10000 };
  const exists = await exec("/bin/test", ["-d", folder], options);
  if (exists.code !== 0) throw new Error(`Worktree folder is unavailable or has been removed: ${folder}`);
  const root = await exec("git", ["-C", folder, "rev-parse", "--show-toplevel"], options);
  const target = root.code === 0 ? root.stdout.replace(/[\r\n]+$/, "") : folder;
  const result = await exec("/usr/bin/open", ["-a", "Visual Studio Code", target], options);
  if (result.code !== 0) throw new Error(result.stderr?.trim() || "Could not open Visual Studio Code. Check that it is installed.");
}
