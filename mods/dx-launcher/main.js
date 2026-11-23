import { View, div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { closeOverlay, exec, focused, home, appHome, readTextFile, knownAgents, panes, props, run, spaces, theme, checking, shared, setShared } from "herdr";
import { folderName, hash, worktreeRoot, parseWorktrees } from "./helpers.js";

async function git(cwd, args, timeout = 30000) {
  const r = await exec("git", args, { cwd, timeout });
  return { ok: r.code === 0, out: (r.stdout || "").trim(), error: (r.stderr || r.stdout || "").trim() };
}
function load(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value && typeof value === "object" && !Array.isArray(value) ? value : fallback; }
  catch { return fallback; }
}

export default class TaskLauncher extends View {
  init(_props, cx) {
    this.busy = false; this.loading = true; this.error = ""; this.info = "";
    this.repo = null; this.base = null; this.choices = []; this.selectedKey = null;
    this.preferences = load("projects-v1", {}); this.lastTasks = load("last-tasks-v1", {});
    this.titleInput = InputState.new({placeholder: "Short title, e.g. Fix audio startup"});
    this.branchInput = InputState.new({placeholder: "codex/fix-audio-startup"});
    this.baseInput = InputState.new({placeholder: "origin/main, main, HEAD, or a commit"});
    this.taskInput = InputState.new({placeholder: "Describe the task and what success looks like"});
    for (const input of [this.titleInput, this.branchInput, this.taskInput]) input.on("change", (_e,cx) => { this.error = ""; cx.notify(); });
    this.baseInput.on("change", (_e,cx) => { this.base = null; cx.notify(); });
    this.titleInput.on("submit", () => this.branchInput.focus());
    this.branchInput.on("submit", () => this.taskInput.focus());
    // Enter in the task field never creates a worktree accidentally.
    this.baseInput.on("submit", (_e,cx) => this.checkBase(cx));
    if (checking()) { this.loading = false; return; }
    this.titleInput.focus();
    cx.spawn(async cx => {
      try {
        const s = spaces().find(s => s.id === props()?.space) || spaces().find(s => s.active);
        if (s?.machine) throw new Error("Choose a local repository. Remote task launching is not enabled.");
        const folder = props()?.folder || focused()?.cwd || s?.folder;
        if (!folder) throw new Error("Open a terminal in a Git repository first.");
        const top = await git(folder, ["rev-parse", "--show-toplevel"]);
        if (!top.ok) throw new Error("Open a terminal in a Git repository first.");
        const list = await git(top.out, ["worktree", "list", "--porcelain", "-z"]);
        const main = parseWorktrees(list.out)[0]?.path;
        if (!list.ok || !main) throw new Error("Could not find the repository's main checkout.");
        const settings = JSON.parse(await readTextFile(`${appHome()}/settings.json`) || "{}");
        const root = worktreeRoot(settings.worktrees?.directory ?? "~/.herdr/worktrees", home());
        this.repo = { main, name: main.split("/").pop(), root };
        const pref = this.preferences[main] || {};
        const remote = await git(main, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
        const localMain = await git(main, ["show-ref", "--verify", "--quiet", "refs/heads/main"]);
        const localMaster = await git(main, ["show-ref", "--verify", "--quiet", "refs/heads/master"]);
        const base = pref.base || (remote.ok ? remote.out : localMain.ok ? "main" : localMaster.ok ? "master" : "HEAD");
        this.baseInput.set_value(base);
        this.choices = (await knownAgents({ on: null })).filter(a => a.installed);
        this.selectedKey = this.choices.find(a => a.key === pref.agent)?.key || this.choices.find(a => a.key === "codex")?.key || this.choices[0]?.key;
        if (!this.selectedKey) throw new Error("No coding agents were found on this machine.");
        await this.validateBase();
      } catch (e) { this.error = String(e.message || e); }
      this.loading = false; cx.notify();
    });
  }

  async validateBase() {
    this.base = null;
    if (!this.repo) return;
    const ref = this.baseInput.value().trim();
    if (!ref || ref.startsWith("-")) throw new Error("Enter a branch or commit as the base.");
    const r = await git(this.repo.main, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
    if (!r.ok) throw new Error("That base does not resolve to a commit. Fetch refs or choose another base.");
    let detail = "Local refs only. Fetch remotes to check for newer commits.";
    const upstream = await git(this.repo.main, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", `${ref}@{upstream}`]);
    if (upstream.ok) {
      const counts = await git(this.repo.main, ["rev-list", "--left-right", "--count", `${ref}...${upstream.out}`]);
      if (counts.ok) { const [ahead,behind] = counts.out.split(/\s+/); detail = `${ahead} ahead, ${behind} behind ${upstream.out} · cached refs`; }
    }
    this.base = { ref, commit:r.out }; this.info = `${ref} · ${r.out.slice(0,8)} · ${detail}`;
  }

  checkBase(cx, fetch = false) {
    if (this.busy || this.loading || !this.repo) return;
    this.busy = true; this.error = ""; cx.notify();
    cx.spawn(async cx => {
      try {
        if (fetch) { const r = await git(this.repo.main, ["fetch", "--all"], 120000); if (!r.ok) throw new Error(r.error || "Fetch failed; existing refs were retained."); }
        await this.validateBase();
        if (fetch) this.info = this.info.replace("Local refs only. Fetch remotes to check for newer commits.", "Remote refs refreshed.").replace("cached refs", "refs just fetched");
      } catch (e) { this.error = String(e.message || e); }
      this.busy = false; cx.notify();
    });
  }

  start(record) {
    const existing = spaces().find(s => !s.machine && (s.folder === record.path || panes().some(p => p.cwd === record.path && s.tabs.some(t => t.id === p.tab))));
    const agent = this.choices.find(a => a.key === record.agent);
    if (!agent) throw new Error("The saved agent is unavailable. Select an installed agent and try again.");
    if (existing) {
      run("space.select", {id:existing.id});
      const live = panes().find(p => p.cwd === record.path && p.program?.agent);
      if (live) { run("pane.focus", {pane:live.pane}); return; }
      run("tab.new", {space:existing.id, name:record.title, folder:record.path, argv:agent.run, task:record.task});
    } else run("space.new", {name:record.title, folder:record.path, tab:record.title, argv:agent.run, task:record.task, machine:""});
  }

  resume(cx) {
    const record = this.lastTasks[this.repo?.main];
    if (!record || this.busy) return;
    this.busy = true; this.error = ""; cx.notify();
    cx.spawn(async cx => {
      try {
        const list = await git(this.repo.main, ["worktree", "list", "--porcelain", "-z"]);
        if (!list.ok || !parseWorktrees(list.out).some(w => w.path === record.path)) throw new Error("The saved worktree is no longer registered. Create a new task instead.");
        this.start({...record, agent:this.selectedKey}); closeOverlay(props().overlay);
      } catch(e) { this.error = String(e.message || e); }
      this.busy = false; cx.notify();
    });
  }

  create(cx) {
    if (this.busy || this.loading || !this.repo || !this.base) return;
    const branch = this.branchInput.value().trim(), task = this.taskInput.value().trim(), title = this.titleInput.value().trim();
    if (!branch || !task || !title || !this.selectedKey) return;
    this.busy = true; this.error = ""; cx.notify();
    cx.spawn(async cx => {
      try {
        const valid = await git(this.repo.main, ["check-ref-format", "--branch", branch]);
        if (!valid.ok) throw new Error(valid.error || "Choose a valid branch name.");
        const expected = this.base.commit;
        await this.validateBase();
        if (expected !== this.base.commit) throw new Error("The base moved. Review the updated commit and press Create again.");
        const exists = await git(this.repo.main, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
        if (exists.ok) throw new Error("That branch exists. Use Resume last task for a previous launch, or choose a new branch.");
        let path = `${this.repo.root}/${this.repo.name}-${hash(this.repo.main)}/${folderName(branch)}`;
        const added = await git(this.repo.main, ["worktree", "add", "-b", branch, path, this.base.commit], 600000);
        if (!added.ok) throw new Error(added.error || "Git could not create the worktree.");
        const canonical = await git(path, ["rev-parse", "--show-toplevel"]);
        if (canonical.ok) path = canonical.out;
        const record = {title, branch, task, path, agent:this.selectedKey, base:this.base.ref, commit:this.base.commit, created:Date.now()};
        this.lastTasks[this.repo.main] = record;
        const tasks = shared("dx.tasks") || {};
        setShared("dx.tasks", {...tasks, [path]:record});
        localStorage.setItem("last-tasks-v1", JSON.stringify(this.lastTasks));
        this.preferences[this.repo.main] = {agent:this.selectedKey, base:this.base.ref};
        localStorage.setItem("projects-v1", JSON.stringify(this.preferences));
        this.start(record); closeOverlay(props().overlay);
      } catch(e) { this.error = String(e.message || e); }
      this.busy = false; cx.notify();
    });
  }

  button(id, text, action, t, enabled = true) {
    return div().id(id).h(30).px(10).rounded(6).bg(t.raised).flex().items_center().text_size(11.5)
      .text_color(enabled ? t.foreground : t.dim)
      .when(enabled, el => el.cursor_pointer().hover(el => el.bg(t.hover)).on_click(action)).child(text);
  }

  field(label, state, t) {
    return v_flex().flex_none().gap(5)
      .child(div().text_size(11.5).font_semibold().text_color(t.foreground).child(label))
      .child(Input.new(state).h(35).px(10).rounded(7).border(1).border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground));
  }

  render() {
    const t = theme(), ready = !this.busy && !this.loading && this.base && this.selectedKey && this.titleInput.value().trim() && this.branchInput.value().trim() && this.taskInput.value().trim();
    const last = this.lastTasks[this.repo?.main];
    return v_flex().id("dx-launcher").size_full().p(18).gap(12).bg(t.popover).overflow_y_scrollbar()
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().text_size(17).font_semibold().text_color(t.foreground).child("New task"))
        .child(this.button("close-launcher", "Close", () => closeOverlay(props().overlay), t)))
      .child(div().text_size(11.5).text_color(t.muted).child(this.loading ? "Checking repository…" : this.repo?.name || "Select a local Git repository"))
      .child(this.field("Task title", this.titleInput, t))
      .child(this.field("New branch", this.branchInput, t))
      .child(this.field("Start from", this.baseInput, t))
      .child(h_flex().gap(8)
        .child(this.button("check-base", "Check base", (_e,cx) => this.checkBase(cx), t, !this.busy && !this.loading && !!this.repo))
        .child(this.button("fetch-base", "Fetch remotes", (_e,cx) => this.checkBase(cx,true), t, !this.busy && !this.loading && !!this.repo)))
      .child(div().text_size(10.5).text_color(t.muted).child(this.base ? this.info : "Check your base before creating the task."))
      .child(this.field("Instructions for the agent", this.taskInput, t))
      .child(h_flex().gap(7).items_center()
        .child(div().text_size(11.5).text_color(t.muted).child("Agent"))
        .children(this.choices.map(a => this.button(`agent-${a.key}`, `${a.key === this.selectedKey ? "✓ " : ""}${a.name}`, (_e,cx) => {this.selectedKey=a.key;cx.notify();}, t, !this.busy))))
      .child(div().text_size(10.5).text_color(t.dim).child("Agent and base are remembered per project. Current checkout changes stay in place."))
      .when(!!last, el => el.child(h_flex().gap(8).items_center()
        .child(this.button("resume-task", "Resume last task", (_e,cx) => this.resume(cx), t, !this.busy && !this.loading))
        .child(div().flex_1().truncate().text_size(11).text_color(t.muted).tooltip(last?.path || "").child(last?.title || ""))))
      .when(!!this.error, el => el.child(div().text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(h_flex().flex_none().justify_end().child(this.button("create-task", this.busy ? "Working…" : "Create worktree and start", (_e,cx) => this.create(cx), t, !!ready)));
  }
}
