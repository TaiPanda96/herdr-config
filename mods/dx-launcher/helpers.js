export function hash(value) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.codePointAt(0), 16777619);
  return (n >>> 0).toString(16).padStart(8, "0");
}
export function folderName(branch) {
  const slug = branch.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "task";
  return `${slug}-${hash(branch)}`;
}
export function worktreeRoot(directory, userHome) {
  if (typeof directory !== "string" || !directory.trim()) throw new Error("Set worktrees.directory to an absolute path or ~/path.");
  let path = directory.trim();
  if (path === "~" || path.startsWith("~/")) path = userHome + path.slice(1);
  if (!path.startsWith("/")) throw new Error("Set worktrees.directory to an absolute path or ~/path.");
  return path.replace(/\/+$/, "");
}
export function parseWorktrees(text) {
  // -z porcelain preserves spaces, quotes, newlines and Unicode in paths.
  return text.split("\0\0").map(block => {
    const lines = block.split("\0");
    const path = lines.find(l => l.startsWith("worktree "))?.slice(9);
    return { path, branch: lines.find(l => l.startsWith("branch "))?.slice(18) || "detached",
      locked: lines.some(l => l.startsWith("locked")) };
  }).filter(r => r.path);
}
