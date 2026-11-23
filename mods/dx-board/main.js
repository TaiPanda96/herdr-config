import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, exec, focused, layout, openOverlay, panes, props, run, setAgentOrder, spaces, terminals, theme, checking, nextCommand, notify, setBadge, shared, setShared } from "herdr";

import { reconcile, reviewKey } from "./review-state.js";
import { openInVSCode } from "./editor.js";

function findNode(node,id) {
  if(node?.id===id)return node;
  for(const child of node?.children || []) {const found=findNode(child,id);if(found)return found;}
  return null;
}

const COLUMNS = [
  { status: "blocked", label: "Needs you", empty: "Nothing needs your response" },
  { status: "done", label: "Needs review", empty: "Nothing to review yet" },
  { status: "working", label: "Working", empty: "No agents are working" },
];

function labelFor(agent) {
  if (agent.child) return agent.title || agent.program?.name || agent.address;
  const title = (agent.title || "").trim();
  if (title && title !== agent.program?.name && !/^[~/]/.test(title) && title.length < 120) return title;
  if (agent.tab_name && !/^\d+$/.test(agent.tab_name)) return agent.tab_name;
  return agent.space_name || agent.program?.name || agent.address;
}

function shortFolder(folder) {
  if (!folder) return "";
  const parts = folder.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : folder;
}

function allAgents() {
  const bySpace = new Map(spaces().map((space) => [space.id, space]));
  const byPane = new Map(panes().map((pane) => [pane.pane, pane]));
  const listed = agents().map((agent) => {
    const pane = byPane.get(agent.pane);
    const space = bySpace.get(agent.space);
    return { ...agent, branch: pane?.branch || space?.branch || null,
      folder: pane?.cwd || space?.folder || null, machine: space?.machine || null };
  });
  const byAddress = new Map(listed.map((agent) => [agent.address, agent]));
  const raw = terminals();
  const byTerminal = new Map(raw.map((terminal) => [terminal.address, terminal]));
  const extras = [];

  for (const terminal of raw) {
    if (terminal.state !== "live" || !terminal.parent || byAddress.has(terminal.address)) continue;
    let parent = byTerminal.get(terminal.parent);
    let owner = byAddress.get(terminal.parent);
    const seen = new Set([terminal.address]);
    while (!owner && parent && !seen.has(parent.address)) {
      seen.add(parent.address);
      owner = byAddress.get(parent.parent);
      parent = byTerminal.get(parent.parent);
    }
    if (!owner) continue;
    const status = terminal.status === "error" ? "blocked" : terminal.status;
    if (!["blocked", "working", "done", "idle"].includes(status)) continue;
    extras.push({
      address: terminal.address,
      pane: null,
      space: owner.space,
      space_name: owner.space_name,
      tab: owner.tab,
      tab_name: owner.tab_name,
      title: terminal.name || terminal.template || terminal.program?.name || "Sub-agent",
      program: terminal.program || owner.program,
      status,
      pinned: Boolean(terminal.labels?.["herdr.pinned"]),
      focused: focused()?.agent === terminal.address,
      seq: 0,
      child: true,
      branch: owner.branch,
      folder: owner.folder,
      machine: owner.machine,
    });
  }
  return [...listed, ...extras];
}

function agentIcon(agent, t) {
  const program = agent.program;
  const glyph = program?.icon
    ? program.tint
      ? svg(program.icon).size(16).text_color(program.color || t.foreground)
      : image(program.icon).w(16).h(16)
    : div().text_size(13).font_bold().text_color(t.foreground)
      .child((program?.name || "A").slice(0, 1).toUpperCase());
  return h_flex().size(30).flex_none().items_center().justify_center()
    .rounded(9).bg(program?.tile || t.raised).child(glyph);
}

export default class AgentBoard extends View {
  init(_props, cx) {
    try { this.reviews = JSON.parse(localStorage.getItem("reviews-v1") || "{}"); }
    catch { this.reviews = {}; }
    if (!this.reviews || typeof this.reviews !== "object" || Array.isArray(this.reviews)) this.reviews = {};
    const sharedReviews = shared("dx.reviews");
    if (sharedReviews && typeof sharedReviews === "object" && !Array.isArray(sharedReviews)) this.reviews = sharedReviews;
    this.badge = undefined;
    this.list = [];
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "next") this.next();
        cx.notify();
      }
    });
  }

  save() {
    localStorage.setItem("reviews-v1", JSON.stringify(this.reviews));
    setShared("dx.reviews", this.reviews);
  }

  open(agent) {
    if (agent.status === "done") { this.reviews = reconcile(this.reviews, [agent], Date.now()); this.save(); }
    if (!agent.inactive) run("agent.focus", { terminal: agent.address });
    else {
      const s = spaces().find(s => s.id === agent.space);
      if (s) run("space.select", { id: s.id });
      else if (agent.folder) run("space.new", { name: labelFor(agent), folder: agent.folder, machine: agent.machine || "" });
    }
  }

  next() {
    const pending = this.list.filter(a => a.column === "blocked" || a.column === "done");
    if (!pending.length) { notify({ title: "You're caught up", body: "No agents need attention or review." }); return; }
    const index = pending.findIndex(a => a.address === focused()?.terminal);
    this.open(pending[(index + 1) % pending.length]);
  }

  mark(agent, state, cx) {
    const key = reviewKey(agent);
    const old = this.reviews[key] || {};
    this.reviews[key] = { ...old, snapshot: { ...agent, title: labelFor(agent) }, state,
      lastStatus: agent.status, seq: agent.seq || 0, updated: Date.now() };
    this.save(); cx.notify();
  }

  review(agent) {
    openOverlay({mod:"dx-review",kind:"dialog",width:840,height:620,
      props:{folder:agent.folder,machine:agent.machine || null,title:labelFor(agent)}});
  }

  openEditor(agent, cx) {
    if (checking() || this.openingEditor) return;
    this.openingEditor = true;
    cx.spawn(async (cx) => {
      try { await openInVSCode(agent, exec); }
      catch (error) { notify({ title: "Could not open worktree", body: String(error.message || error), level: "error" }); }
      finally { this.openingEditor = false; cx.notify(); }
    });
  }

  close() { if (!checking()) setBadge(null); }

  focus(agent) {
    this.open(agent);
    if (agent.pane && !panes().find((pane) => pane.pane === agent.pane)?.zoomed) {
      run("pane.zoom", { pane: agent.pane });
    }
  }

  newTaskButton(t) {
    return div().id("new-task").px(8).h(24).rounded(7).bg(t.raised)
      .flex().items_center().text_size(11).font_semibold().text_color(t.foreground)
      .cursor_pointer().hover((el) => el.bg(t.selected))
      .tooltip("Start a task from a base you choose · Cmd+Shift+N")
      .on_click(() => openOverlay({ mod: "dx-launcher", kind: "dialog", width: 620, height: 620,
        props: { space: focused()?.space, folder: focused()?.cwd } }))
      .child("+ New task");
  }

  card(agent, t, color) {
    const title = labelFor(agent);
    const context = `${agent.child ? "Sub-agent" : agent.program?.name || "Agent"} · ${agent.branch || agent.space_name}`;
    return v_flex().id(`card-${agent.address}`).w_full().flex_none()
      .p(12).gap(7).rounded(11).bg(agent.focused ? t.selected : t.surface)
      .border(1).border_color(agent.focused ? t.accent : t.border)
      .cursor_pointer().hover((el) => el.bg(t.raised))
      .on_click(() => this.open(agent))
      .child(h_flex().gap(10).items_center()
        .child(agentIcon(agent, t))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).tooltip(title).child(title))
          .child(div().truncate().text_size(11).text_color(t.muted).child(context))))
      .when(Boolean(agent.folder), (el) => el.child(div().id(`vscode-${agent.address}`)
        .truncate().text_size(10.5).text_color(t.accent).cursor_pointer()
        .hover(el => el.text_color(t.foreground))
        .tooltip(`Open in VS Code: ${agent.folder}`)
        .on_click((_e, cx) => { cx.stop_propagation(); this.openEditor(agent, cx); })
        .child(`↗ ${shortFolder(agent.folder)}`)))
      .child(h_flex().items_center().gap(6)
        .child(div().size(6).rounded(3).bg(color))
        .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(agent.address))
        .child(div().id(`focus-${agent.address}`).px(5).h(21).rounded(5)
          .flex().items_center().text_size(11).font_medium().text_color(color)
          .hover((el) => el.bg(t.hover)).tooltip(agent.pane ? "Open and zoom this pane" : "Open this agent")
          .on_click((_event, cx) => { cx.stop_propagation(); this.focus(agent); })
          .child(agent.pane ? "Focus ↗" : "Open ›")))
      .when(agent.column === "done", el => el.child(h_flex().gap(7)
        .child(this.action(`diff-${agent.address}`, "Review", () => this.review(agent), t))
        .child(this.action(`reviewed-${agent.address}`, "Reviewed ✓", (_e, cx) => this.mark(agent, "reviewed", cx), t))))
      .when(Boolean(agent.inactive), el => el.child(h_flex().items_center().gap(7)
        .child(div().flex_1().text_size(10.5).text_color(t.dim).child("Session closed · review kept"))
        .child(this.action(`dismiss-${agent.address}`, "Dismiss", (_e, cx) => this.mark(agent, "dismissed", cx), t)
          .tooltip("Remove this saved review from the board without marking it reviewed or deleting files"))));
  }

  action(id, label, fn, t) {
    return div().id(id).h(24).px(7).rounded(5).bg(t.raised).text_size(11)
      .text_color(t.foreground).flex().items_center().cursor_pointer()
      .hover(el => el.bg(t.hover)).on_click((e, cx) => { cx.stop_propagation(); fn(e, cx); }).child(label);
  }

  column(column, members, t) {
    const color = t[column.status] || t.accent;
    return v_flex().id(`column-${column.status}`).flex_1().h_full().min_w(0).min_h(0)
      .rounded(13).bg(t.chrome).border(1).border_color(t.border)
      .child(h_flex().h(48).flex_none().px(14).items_center().gap(9)
        .child(div().size(8).rounded(4).bg(color))
        .child(div().flex_1().text_size(13).font_semibold().text_color(t.foreground).child(column.label))
        .child(h_flex().min_w(22).h(22).px(7).items_center().justify_center()
          .rounded(7).bg(t.raised).text_size(11).font_semibold().text_color(color)
          .child(String(members.length))))
      .child(v_flex().id(`list-${column.status}`).flex_1().min_h(0).p(8).gap(8)
        .overflow_y_scrollbar().mode("always")
        .children(members.length
          ? members.map((agent) => this.card(agent, t, color))
          : [div().p(14).text_size(12).text_color(t.dim).child(column.empty)]));
  }

  sidebarSection(column, members, t) {
    const color = t[column.status] || t.accent;
    return v_flex().id(`rail-${column.status}`).flex_none().gap(6)
      .child(h_flex().h(29).items_center().gap(8).px(4)
        .child(div().size(7).rounded(4).bg(color))
        .child(div().flex_1().text_size(11).font_semibold().text_color(t.foreground).child(column.label))
        .child(div().text_size(11).text_color(color).child(String(members.length))))
      .children(members.map((agent) => this.card(agent, t, color)));
  }

  sidebar(list, t) {
    const sidebarWidth = findNode(layout(), "sidebar")?.size?.px ?? 330;
    if (sidebarWidth < 160) {
      return v_flex().id("agent-board-rail").size_full().min_h(0).p(5).gap(5)
        .bg(t.chrome).border_t(1).border_color(t.border).overflow_y_scrollbar()
        .child(this.action("rail-task", "+", () => openOverlay({mod:"dx-launcher",kind:"dialog",width:620,height:620}),t))
        .child(this.action("rail-next", "Next", () => this.next(),t))
        .children(list.map((agent) => h_flex().id(`rail-icon-${agent.address}`)
          .h(33).flex_none().items_center().justify_center().gap(3).rounded(7)
          .cursor_pointer().hover((el) => el.bg(t.hover))
          .on_click(() => this.open(agent))
          .child(agentIcon(agent, t))
          .child(div().size(5).rounded(3).bg(t[agent.column] || t.dim))));
    }
    const idle = list.filter((agent) => agent.column === "idle");
    const sections = COLUMNS.map((column) => this.sidebarSection(
      column, list.filter((agent) => agent.column === column.status), t));
    const idleRows = idle.map((agent) => h_flex().id(`rail-idle-${agent.address}`)
      .h(31).flex_none().px(9).items_center().gap(7).rounded(8)
      .cursor_pointer().hover((el) => el.bg(t.hover))
      .on_click(() => this.open(agent))
      .child(div().size(6).rounded(3).border(1).border_color(t.idle || t.dim))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5)
        .text_color(t.muted).tooltip(labelFor(agent)).child(labelFor(agent)))
      .when(Boolean(agent.folder), el => el.child(this.action(`vscode-idle-${agent.address}`, "Code ↗", (_e, cx) => this.openEditor(agent, cx), t)))
      .child(this.action(`queue-${agent.address}`, "Review", (_e, cx) => this.mark(agent, "pending", cx), t)));
    return v_flex().id("agent-board-sidebar").size_full().min_h(0)
      .bg(t.chrome).border_t(1).border_color(t.border)
      .child(h_flex().h(40).flex_none().px(14).items_center()
        .child(div().flex_1().text_size(11.5).font_semibold().text_color(t.foreground).child("Agent board"))
        .child(this.action("next-attention", "Next", () => this.next(), t)))
      .child(h_flex().h(33).flex_none().px(12).gap(7)
        .child(this.newTaskButton(t))
        .child(this.action("worktrees", "Worktrees", () => openOverlay({mod: "dx-worktrees", kind: "dialog", width: 760, height: 540}), t)))
      .child(v_flex().id("agent-board-sidebar-list").flex_1().min_h(0)
        .px(9).pb(10).gap(9).overflow_y_scrollbar().mode("always")
        .children(sections)
        .when(idle.length > 0, (el) => el.child(v_flex().flex_none().gap(3)
          .child(h_flex().h(27).px(4).items_center()
            .child(div().flex_1().text_size(11).font_semibold().text_color(t.dim).child("Idle"))
            .child(div().text_size(11).text_color(t.dim).child(String(idle.length))))
          .children(idleRows))));
  }

  render() {
    const t = theme();
    const live = allAgents();
    const sharedReviews = shared("dx.reviews");
    if (sharedReviews && typeof sharedReviews === "object" && !Array.isArray(sharedReviews)) this.reviews = sharedReviews;
    const before = JSON.stringify(this.reviews);
    this.reviews = reconcile(this.reviews, live, Date.now());
    if (!checking() && before !== JSON.stringify(this.reviews)) this.save();
    const keys = new Set(live.map(reviewKey));
    const absent = Object.entries(this.reviews).filter(([key, r]) => r.state === "pending" && r.snapshot && !keys.has(key))
      .map(([, r]) => ({ ...r.snapshot, inactive: true, focused: false, pane: null, status: "idle" }));
    const list = [...live, ...absent].map(agent => ({ ...agent,
      column: agent.status === "blocked" ? "blocked" : agent.status === "working" ? "working"
        : this.reviews[reviewKey(agent)]?.state === "pending" ? "done" : "idle" }));
    this.list = list;
    const count = list.filter(a => a.column === "blocked" || a.column === "done").length;
    const badge = count ? String(count) : null;
    if (!checking() && this.badge !== badge) { setBadge(badge); this.badge = badge; }
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.seq || 0) - (a.seq || 0));
    const ordered = [...COLUMNS.flatMap((column) => list.filter((a) => a.column === column.status)),
      ...list.filter((a) => a.column === "idle")];
    this.list = ordered;
    setAgentOrder(ordered.map((a) => a.address));
    if (props()?.mode === "sidebar") return this.sidebar(list, t);
    const idle = list.filter((agent) => agent.column === "idle");

    const idleChips = idle.map((agent) => div().id(`idle-${agent.address}`)
      .max_w(220).flex_none().px(9).h(25).rounded(7).bg(t.chrome)
      .border(1).border_color(t.border).text_size(11).text_color(t.muted)
      .truncate().cursor_pointer().hover((item) => item.bg(t.raised).text_color(t.foreground))
      .on_click(() => this.open(agent))
      .child(labelFor(agent)));

    const idleRow = h_flex().h(35).flex_none().items_center().gap(8)
      .child(div().text_size(11).font_semibold().text_color(t.dim).child(`Idle ${idle.length}`))
      .child(h_flex().id("idle-agents").flex_1().min_w(0).h_full().gap(6)
        .items_center().overflow_x_scrollbar().children(idleChips));

    return v_flex().id("agent-board").size_full().min_h(0).p(12).gap(11).bg(t.canvas)
      .child(h_flex().h(33).flex_none().items_center().gap(10)
        .child(div().text_size(18).font_bold().text_color(t.foreground).child("Agent board"))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.muted).child(`${list.length} agents`))
        .child(this.newTaskButton(t)))
      .child(h_flex().id("board-columns").flex_1().min_h(0).gap(10).items_stretch()
        .children(COLUMNS.map((column) => this.column(column, list.filter((a) => a.column === column.status), t))))
      .when(idle.length > 0, (el) => el.child(idleRow));
  }
}
