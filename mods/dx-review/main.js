import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { exec, props, checking, closeOverlay, theme, shared } from "herdr";

function checks(pr) {
  const all=pr.statusCheckRollup || [];
  if(!all.length) return "No checks reported";
  const failed=all.filter(c=>["FAILURE","ERROR","CANCELLED","TIMED_OUT","ACTION_REQUIRED"].includes(c.conclusion || c.state)).length;
  const pending=all.filter(c=>c.status && c.status!=="COMPLETED" || ["PENDING","EXPECTED"].includes(c.state)).length;
  return `${all.length} checks · ${failed} failed · ${pending} pending`;
}
export default class ReviewTask extends View {
  init(_props,cx) {
    this.loading=true;this.error="";this.text="";this.pr=null;this.prInfo="";
    if(checking()){this.loading=false;return;}
    cx.spawn(async cx=>{
      try {
        const p=props(), cwd=p.folder, on=p.machine || null;
        if(!cwd) throw new Error("This task has no saved repository folder.");
        const options={cwd,on,timeout:15000};
        let base=shared("dx.tasks")?.[cwd]?.commit;
        if(!base){
          const remote=await exec("git",["symbolic-ref","--short","refs/remotes/origin/HEAD"],options);
          base=remote.code===0?remote.stdout.trim():"main";
        }
        let resolved=await exec("git",["rev-parse","--verify","--end-of-options",`${base}^{commit}`],options);
        if(resolved.code!==0 && base==="main") {base="master";resolved=await exec("git",["rev-parse","--verify","refs/heads/master^{commit}"],options);}
        const status=await exec("git",["status","--short"],options);
        const branch=await exec("git",["branch","--show-current"],options);
        let diff="Base could not be resolved. Open the repository to inspect committed changes.";
        if(resolved.code===0){
          const r=await exec("git",["diff","--stat",`${resolved.stdout.trim()}...HEAD`],options);
          diff=r.code===0?r.stdout.trim() || "No committed changes relative to this base.":r.stderr;
        }
        this.text=`### ${branch.stdout.trim() || "Detached HEAD"}\n\nBase: ${base}\n\n### Committed changes\n\n${diff}\n\n### Uncommitted files\n\n${status.code===0?status.stdout.trim() || "Working tree clean.":status.stderr}`;
      }catch(e){this.error=String(e.message||e);}
      this.loading=false;cx.notify();
    });
  }
  loadPR(cx) {
    if(this.prLoading)return;
    this.prLoading=true;this.prInfo="Checking GitHub…";cx.notify();
    cx.spawn(async cx=>{
      try{
        const r=await exec("gh",["pr","view","--json","number,title,url,state,reviewDecision,statusCheckRollup"],{cwd:props().folder,on:props().machine || null,timeout:20000});
        if(r.code!==0) {this.prInfo=r.stderr.trim() || "No pull request found for this branch.";this.pr=null;}
        else {this.pr=JSON.parse(r.stdout);this.prInfo=`#${this.pr.number} ${this.pr.state} · ${this.pr.reviewDecision || "No review decision"} · ${checks(this.pr)}`;}
      }catch(e){this.prInfo=`Could not read pull request: ${e.message || e}`;}
      this.prLoading=false;cx.notify();
    });
  }
  render() {
    const t=theme();
    const button=(id,label,action)=>div().id(id).h(29).px(10).rounded(6).bg(t.raised).text_size(11.5).text_color(t.foreground)
      .flex().items_center().cursor_pointer().hover(el=>el.bg(t.hover)).on_click(action).child(label);
    return v_flex().id("dx-review").size_full().p(18).gap(12).bg(t.popover)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().truncate().text_size(16).font_semibold().text_color(t.foreground).child(props()?.title || "Review task"))
        .child(button("check-pr",this.prLoading?"Checking…":"PR / checks",(_e,cx)=>this.loadPR(cx)))
        .child(button("close-review","Close",()=>closeOverlay(props().overlay))))
      .child(div().text_size(11).text_color(t.muted).child(props()?.folder || ""))
      .when(!!this.prInfo,el=>el.child(div().text_size(11.5).text_color(t.muted).child(this.prInfo)))
      .when(!!this.pr?.url,el=>el.child(div().text_size(11).text_color(t.accent).child(this.pr.url)))
      .when(!!this.error,el=>el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("review-summary").flex_1().min_h(0).overflow_y_scrollbar()
        .child(TextView.markdown("review-text",this.loading?"Reading repository…":this.text)))
      .child(div().text_size(10.5).text_color(t.dim).child("Read-only summary. PR / checks queries GitHub only when clicked. Close this view and choose Reviewed when you've finished."));
  }
}
