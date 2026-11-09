import { View, div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { closeOverlay, exec, focused, home, knownAgents, panes, props, run, spaces, theme } from "herdr";

async function git(cwd, args, timeout = 30000) {
  const result = await exec("git", args, { cwd, timeout });
  return { ok: result.code === 0, out: (result.stdout || "").trim(),
    error: (result.stderr || result.stdout || "").trim() };
}

function slug(branch) {
  return branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function taskName(task, branch) {
  return task.split(/[.!?\n]/)[0].trim().slice(0, 44) || branch;
}

export default class TaskLauncher extends View {
  init(_props, cx) {
    this.busy = false;
    this.loading = true;
    this.error = "";
    this.repo = null;
    this.choices = [];
    this.selectedKey = null;
    this.branchInput = InputState.new({ placeholder: "codex/task-name" });
    this.taskInput = InputState.new({ placeholder: "Describe what the agent should do" });
    this.branchInput.on("change", (_event, cx) => { this.error = ""; cx.notify(); });
    this.taskInput.on("change", (_event, cx) => { this.error = ""; cx.notify(); });
    this.branchInput.on("submit", () => this.taskInput.focus());
    this.taskInput.on("submit", (_event, cx) => this.create(cx));
    this.branchInput.focus();
    cx.timer.after(300, () => this.branchInput.focus());

    cx.spawn(async (cx) => {
      try {
        const selectedSpace = spaces().find((space) => space.id === props()?.space)
          || spaces().find((space) => space.active);
        if (selectedSpace?.machine) throw new Error("This launcher currently supports local Git repositories.");
        const folder = props()?.folder || panes().find((pane) => pane.focused)?.cwd
          || focused()?.cwd || selectedSpace?.folder;
        if (!folder) throw new Error("Select a terminal inside a Git repository first.");
        const top = await git(folder, ["rev-parse", "--show-toplevel"]);
        if (!top.ok) throw new Error("The selected terminal is outside a Git repository.");
        const list = await git(top.out, ["worktree", "list", "--porcelain"]);
        const main = list.out.split("\n").find((line) => line.startsWith("worktree "))?.slice(9);
        if (!list.ok || !main) throw new Error("Could not find the main checkout.");
        const base = await git(main, ["rev-parse", "--verify", "refs/heads/main"]);
        if (!base.ok) throw new Error("This repository has no local main branch.");
        this.repo = { main, name: main.replace(/\\/g, "/").split("/").pop(), base: base.out.slice(0, 8) };
        this.choices = (await knownAgents({ on: null })).filter((agent) => agent.installed);
        this.selectedKey = this.choices.find((agent) => agent.key === "codex")?.key
          || this.choices[0]?.key || null;
        if (!this.choices.length) throw new Error("No coding agents are installed on this Mac.");
      } catch (error) {
        this.error = String(error.message || error);
      }
      this.loading = false;
      cx.notify();
    });
  }

  create(cx) {
    if (this.busy || this.loading || !this.repo) return;
    const branch = this.branchInput.value().trim();
    const task = this.taskInput.value().trim();
    const agent = this.choices.find((choice) => choice.key === this.selectedKey);
    if (!branch || !task || !agent) {
      this.error = "Enter a branch, a task, and an agent.";
      cx.notify();
      return;
    }
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const valid = await git(this.repo.main, ["check-ref-format", "--branch", branch]);
        if (!valid.ok) throw new Error(valid.error || "Choose a valid Git branch name.");
        const exists = await git(this.repo.main, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
        if (exists.ok) throw new Error("That local branch already exists. Choose a new name.");
        const base = await git(this.repo.main, ["rev-parse", "--verify", "refs/heads/main"]);
        if (!base.ok) throw new Error("The local main branch is unavailable.");
        const folderName = slug(branch);
        if (!folderName) throw new Error("Choose a branch name with letters or numbers.");
        const path = `${home()}/.herdr/worktrees/${this.repo.name}/${folderName}`;
        const added = await git(this.repo.main,
          ["worktree", "add", "-b", branch, path, "refs/heads/main"], 600000);
        if (!added.ok) throw new Error(added.error || "Git could not create the worktree.");
        const name = taskName(task, branch);
        run("space.new", { name, folder: path, tab: name, argv: agent.run,
          task, machine: "" });
        closeOverlay(props().overlay);
      } catch (error) {
        this.error = String(error.message || error);
      }
      this.busy = false;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const ready = Boolean(this.repo && this.selectedKey && !this.busy && !this.loading
      && this.branchInput.value().trim() && this.taskInput.value().trim());
    return v_flex().id("task-launcher").size_full().p(18).gap(11).bg(t.popover)
      .child(h_flex().h(29).flex_none().items_center()
        .child(div().flex_1().text_size(17).font_semibold().text_color(t.foreground)
          .child("New task in worktree"))
        .child(div().id("task-close").px(7).h(24).rounded(6).flex().items_center()
          .text_size(15).text_color(t.muted).cursor_pointer()
          .hover((el) => el.bg(t.hover).text_color(t.foreground))
          .on_click(() => closeOverlay(props().overlay)).child("×")))
      .child(div().text_size(11.5).text_color(t.muted)
        .child(this.loading ? "Checking repository and agents…"
          : this.repo ? `${this.repo.name} · local main ${this.repo.base}` : "Select a local Git repository"))
      .child(v_flex().flex_none().gap(5)
        .child(div().text_size(11).font_semibold().text_color(t.foreground).child("New branch"))
        .child(Input.new(this.branchInput).h(34).px(10).rounded(8).border(1)
          .border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground)))
      .child(v_flex().flex_none().gap(5)
        .child(div().text_size(11).font_semibold().text_color(t.foreground).child("Task for the agent"))
        .child(Input.new(this.taskInput).h(34).px(10).rounded(8).border(1)
          .border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground)))
      .child(h_flex().h(27).flex_none().items_center().gap(7)
        .child(div().text_size(11).text_color(t.muted).child("Agent"))
        .children(this.choices.map((agent) => div().id(`choice-${agent.key}`)
          .px(9).h(25).rounded(7).flex().items_center().text_size(11)
          .text_color(agent.key === this.selectedKey ? t.foreground : t.muted)
          .bg(agent.key === this.selectedKey ? t.selected : t.raised)
          .cursor_pointer().hover((el) => el.bg(t.hover))
          .on_click((_event, cx) => { this.selectedKey = agent.key; cx.notify(); })
          .child(agent.name))))
      .child(div().flex_1().min_h(0).text_size(10.5).text_color(t.dim)
        .child("Starts from committed main. Uncommitted changes stay in the current checkout."))
      .when(Boolean(this.error), (el) => el.child(div().text_size(11).text_color(t.blocked)
        .child(this.error)))
      .child(h_flex().h(32).flex_none().justify_end()
        .child(div().id("task-create").px(13).h(32).rounded(8)
          .flex().items_center().font_semibold().text_size(11.5)
          .bg(ready ? t.solid : t.raised)
          .text_color(ready ? t.solid_foreground : t.dim)
          .when(ready, (el) => el.cursor_pointer().hover((hover) => hover.bg(t.accent))
            .on_click((_event, cx) => this.create(cx)))
          .child(this.busy ? "Creating…" : "Create worktree and start")));
  }
}
