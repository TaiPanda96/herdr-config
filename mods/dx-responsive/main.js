import { View, div } from "gpui-kit";
import { run, layout, checking, setShared } from "herdr";
import { workspaceSizing } from "./sizing.js";
function find(node,id){if(node?.id===id)return node;for(const child of node?.children || []){const found=find(child,id);if(found)return found;}return null;}
export default class ResponsiveWorkspace extends View {
  init(){this.mode=null;this.width=0;this.hiddenPanel=null;}
  resize(size) {
    if(checking() || !size.width || Math.abs(this.width-size.width)<8)return;
    this.width=size.width;
    const next=workspaceSizing(size.width), tree=layout();
    const sidebar=find(tree,"sidebar"), panel=find(tree,"panel");
    // The measuring strip spans the root, so changing a sidebar never changes its input.
    if(sidebar && Math.abs((sidebar.size?.px || 0)-next.sidebar)>8) run("layout.resize",{id:"sidebar",px:next.sidebar});
    if(next.panel===null && panel && !panel.hidden){
      this.hiddenPanel=find(tree,"panel-body")?.active || "files";
      run("layout.hide",{id:"panel"});
    }else if(next.panel && panel){
      if(Math.abs((panel.size?.px || 0)-next.panel)>8)run("layout.resize",{id:"panel",px:next.panel});
      if(this.hiddenPanel && panel.hidden){run("layout.select",{stack:"panel-body",child:this.hiddenPanel});run("layout.show",{id:"panel"});this.hiddenPanel=null;}
    }
    if(this.mode!==next.mode){this.mode=next.mode;setShared("dx.viewport",next.mode);}
  }
  render(){return div().id("dx-measure").size_full().on_size_change(size=>this.resize(size));}
}
