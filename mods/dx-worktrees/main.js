import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, focused, spaces, panes, props, theme, run, openOverlay, closeOverlay, checking, nextCommand } from "herdr";
import { parseWorktrees } from "./helpers.js";

export default class WorktreeInventory extends View {
  init(_props,cx) {
    this.rows=[]; this.error=""; this.loading=false; this.base="";
    if (!checking()) {
      this.reload(cx);
      cx.spawn(async cx => {
        for (;;) {
          const command = await nextCommand();
          if (command === "refresh") this.reload(cx);
        }
      });
    }
  }
  reload(cx) {
    if (this.loading) { this.reloadPending=true; return; }
    this.loading=true; this.error=""; cx.notify();
    cx.spawn(async cx => {
      try {
        const selected=spaces().find(s=>s.active);
        if (!this.main && selected?.machine) throw new Error("Choose a local repository to inspect its worktrees.");
        const cwd=this.main || props()?.folder || focused()?.cwd || selected?.folder;
        if (!cwd) throw new Error("Open a terminal in a Git repository first.");
        const r=await exec("git",["worktree","list","--porcelain","-z"],{cwd});
        if(r.code!==0) throw new Error(r.stderr || "The selected folder is not a Git repository.");
        const rows=parseWorktrees(r.stdout), main=rows[0]?.path;
        if(!main) throw new Error("No registered checkouts were found.");
        this.main=main;
        const remote=await exec("git",["symbolic-ref","--short","refs/remotes/origin/HEAD"],{cwd:main});
        this.base=remote.code===0?remote.stdout.trim():"main";
        let valid=await exec("git",["rev-parse","--verify",`${this.base}^{commit}`],{cwd:main});
        if(valid.code!==0) { this.base="master"; valid=await exec("git",["rev-parse","--verify",`${this.base}^{commit}`],{cwd:main}); }
        this.baseCommit=valid.code===0?valid.stdout.trim():null;
        this.rows=await Promise.all(rows.map(async (w,index)=>{
          try {
            const status=await exec("git",["status","--porcelain","-z"],{cwd:w.path});
            const merged=this.baseCommit?await exec("git",["merge-base","--is-ancestor","HEAD",this.baseCommit],{cwd:w.path}):null;
            return {...w, main:index===0, dirty:status.code===0?!!status.stdout:null,
              merged:merged?.code===0, error:status.code!==0?status.stderr:""};
          } catch(e) { return {...w,main:index===0,dirty:null,merged:false,error:String(e.message||e)}; }
        }));
      } catch(e) {this.rows=[];this.error=String(e.message||e);}
      this.loading=false;cx.notify();
      if (this.reloadPending) {this.reloadPending=false;this.reload(cx);}
    });
  }
  activeAgents(path) {return panes().filter(p=>p.cwd && (p.cwd===path || p.cwd.startsWith(path+"/")) && p.program?.agent);}
  open(row) {
    const s=spaces().find(s=>!s.machine && (s.folder===row.path || panes().some(p=>p.cwd===row.path && s.tabs.some(t=>t.id===p.tab))));
    if(s) run("space.select",{id:s.id});
    else run("space.new",{name:row.branch,folder:row.path,machine:""});
    closeOverlay(props().overlay);
  }
  remove() { return; } // Paused following a post-removal lifecycle failure.
  button(id,text,action,t,enabled=true) {
    return div().id(id).px(9).h(27).flex().items_center().rounded(6).bg(t.raised).text_size(11)
      .text_color(enabled?t.foreground:t.dim).when(enabled,el=>el.cursor_pointer().hover(el=>el.bg(t.hover)).on_click(action)).child(text);
  }
  render() {
    const t=theme();
    return v_flex().id("dx-worktrees").size_full().p(18).gap(12).bg(t.popover)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().text_size(17).font_semibold().text_color(t.foreground).child("Worktree inventory"))
        .child(this.button("refresh-worktrees",this.loading?"Checking…":"Refresh",(_e,cx)=>this.reload(cx),t,!this.loading))
        .child(this.button("close-worktrees","Close",()=>closeOverlay(props().overlay),t)))
      .child(div().text_size(11).text_color(t.muted).child(`Commit reachability is compared with ${this.base || "the default branch"}, using local refs. Squash merges may still appear unmerged.`))
      .when(!!this.error,el=>el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("worktree-list").flex_1().min_h(0).gap(9).overflow_y_scrollbar()
        .children(this.rows.map((row,i)=>{
          const active=this.activeAgents(row.path).length;
          const removable=false;
          const status=[row.main?"Main checkout":row.merged?"Commits in base":"Commits outside base",row.dirty===null?"Status unavailable":row.dirty?"Uncommitted files":"Clean",`${active} agent${active===1?"":"s"}`,row.locked?"Locked":""].filter(Boolean).join(" · ");
          return v_flex().id(`worktree-${i}`).p(12).gap(7).rounded(8).bg(t.surface).border(1).border_color(t.border)
            .child(div().text_size(13).font_semibold().text_color(t.foreground).child(row.branch))
            .child(div().text_size(10.5).text_color(t.muted).child(row.path))
            .child(div().text_size(11).text_color(row.dirty?t.blocked:t.muted).child(status))
            .when(!!row.error,el=>el.child(div().text_size(10.5).text_color(t.blocked).child(row.error)))
            .child(h_flex().gap(8)
              .child(this.button(`open-${i}`,"Open",()=>this.open(row),t))
              .child(this.button(`remove-${i}`,row.main?"Main checkout":row.locked?"Locked":"Removal paused",()=>this.remove(row),t,removable)));
        })))
      .child(div().text_size(10.5).text_color(t.dim).child("Worktree removal is paused while its lifecycle is audited. Inspection, Open, and Refresh remain available."));
  }
}
