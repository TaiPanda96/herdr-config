import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const command=promisify(execFile), app=path.resolve(import.meta.dirname,'..');
const source=p=>fs.readFileSync(path.join(app,p),'utf8');
const importPure=async p=>import('data:text/javascript;base64,'+Buffer.from(source(p)).toString('base64'));
const {reconcile,reviewKey}=await importPure('mods/dx-board/review-state.js');
const {folderName,worktreeRoot,parseWorktrees}=await importPure('mods/dx-launcher/helpers.js');
const {workspaceSizing}=await importPure('mods/dx-responsive/sizing.js');
const a={address:'t1',space:'s1',tab:'tab1',status:'working',seq:1,folder:'/test',title:'Task'};
let records=reconcile({},[a],1);
records=reconcile(records,[{...a,status:'done',seq:2}],2);
assert.equal(records[reviewKey(a)].state,'pending');
records=reconcile(records,[{...a,status:'idle',seq:3}],3);
assert.equal(records[reviewKey(a)].state,'pending','Opening a completed task must not acknowledge review');
records=JSON.parse(JSON.stringify(records));records=reconcile(records,[],4);
assert.equal(records[reviewKey(a)].state,'pending','Closed sessions must remain in the inbox');
records[reviewKey(a)].state='reviewed';
records=reconcile(records,[{...a,status:'idle',seq:3}],5);
assert.equal(records[reviewKey(a)].state,'reviewed');
records=reconcile(records,[{...a,status:'working',seq:4}],6);
records=reconcile(records,[{...a,status:'idle',seq:5}],7);
assert.equal(records[reviewKey(a)].state,'pending','Work completing while focused must still need review');
assert.notEqual(folderName('foo/bar'),folderName('foo-bar'));
assert.notEqual(folderName('✨'),folderName('🎉'));
assert.equal(worktreeRoot('~/custom','/Users/test'),'/Users/test/custom');
assert.throws(()=>worktreeRoot('relative/path','/Users/test'));
for(const width of [640,800,899,900,1050,1199,1200,1440,1920,2560]){
 const sizes=workspaceSizing(width);
 assert.ok(width-sizes.sidebar>=500,`Terminal space at width ${width}`);
 assert.equal(sizes.panel===null,width<1200);
 assert.ok(sizes.sidebar<=360);
}
console.log('PASS: review lifecycle, collision-resistant paths, responsive breakpoints');

// Exercise the actual launcher against a disposable Git repository; no agents are started.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'herdr-dx-test-'));
const repo=path.join(temp,'repo');fs.mkdirSync(repo);
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git('init','-b','trunk');fs.writeFileSync(path.join(repo,'README.md'),'baseline\n');git('add','README.md');
git('-c','user.name=DX Test','-c','user.email=dx-test@example.invalid','commit','-m','baseline');
const base=git('rev-parse','HEAD');fs.writeFileSync(path.join(repo,'README.md'),'uncommitted original\n');
const storage=new Map(), calls=[], pending=[], sharedState={};let liveSpaces=[],livePanes=[],failStart=false;
class InputState{constructor(o){this.text=o.value || '';this.handlers={};}value(){return this.text;}set_value(v){this.text=v;this.handlers.change?.({},cx);}on(name,fn){this.handlers[name]=fn;}focus(){}}
const cx={focus_handle:()=>({focus(){}}),notify(){},spawn(fn){const p=fn(cx);pending.push(p);},timer:{after(){}}};
const drain=async()=>{while(pending.length)await pending.shift();};
const context=vm.createContext({console,Date,Map,Set,JSON,Math,Boolean,String,Error,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
const ui={View:class{},div(){}};
const baseUI={InputState:{new:o=>new InputState(o)},Input:{},h_flex(){},v_flex(){}};
const host={checking:()=>false,focused:()=>({cwd:repo,space:'root'}),spaces:()=>liveSpaces,panes:()=>livePanes,
 home:()=>temp,appHome:()=>app,props:()=>({overlay:'test'}),theme:()=>({}),closeOverlay(){},
 readTextFile:async()=>JSON.stringify({worktrees:{directory:path.join(temp,'custom-worktrees')}}),
 knownAgents:async()=>[{key:'codex',name:'Codex',installed:true,run:['codex','--no-daemon']}],
 shared:k=>sharedState[k],setShared:(k,v)=>sharedState[k]=v,
 run:(name,args)=>{if(failStart)throw new Error('Simulated launch failure');calls.push({name,args});},
 exec:async(cmd,args,options)=>{if(options.on==='')throw new Error('unknown machine ""');try{const r=await command(cmd,args,{cwd:options.cwd,timeout:options.timeout});return {code:0,...r};}catch(e){return {code:typeof e.code==='number'?e.code:1,stdout:e.stdout || '',stderr:e.stderr || e.message};}}
};
const synthetic=values=>{const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});return m;};
const helper=new vm.SourceTextModule(source('mods/dx-launcher/helpers.js'),{context});
const launcherModule=new vm.SourceTextModule(source('mods/dx-launcher/main.js'),{context});
const imports={'gpui-kit':synthetic(ui),'gpui-base':synthetic(baseUI),'herdr':synthetic(host),'./helpers.js':helper};
await launcherModule.link(spec=>imports[spec]);await launcherModule.evaluate();
const Launcher=launcherModule.namespace.default;
const launcher=new Launcher();launcher.init({},cx);await drain();
assert.equal(launcher.error,'');assert.equal(launcher.base.ref,'HEAD','A repository with no main/master must launch');
const launch=async(branch)=>{launcher.titleInput.set_value('Short task');launcher.branchInput.set_value(branch);launcher.taskInput.set_value('Verify isolation');launcher.create(cx);await drain();};
await launch('foo/bar');assert.equal(launcher.error,'');
await launch('foo-bar');assert.equal(launcher.error,'');
assert.equal(calls.filter(c=>c.name==='space.new').length,2);
const paths=calls.filter(c=>c.name==='space.new').map(c=>c.args.folder);
assert.notEqual(paths[0],paths[1]);
for(const cwd of paths){assert.equal(fs.readFileSync(path.join(cwd,'README.md'),'utf8'),'baseline\n');assert.ok(cwd.startsWith(fs.realpathSync(path.join(temp,'custom-worktrees'))));}
assert.equal(fs.readFileSync(path.join(repo,'README.md'),'utf8'),'uncommitted original\n');
assert.equal(git('rev-parse','HEAD'),base);
failStart=true;await launch('retry-task');assert.match(launcher.error,/Simulated launch failure/);
const recovery=JSON.parse(storage.get('last-tasks-v1'))[launcher.repo.main];assert.equal(recovery.branch,'retry-task');
failStart=false;launcher.resume(cx);await drain();assert.equal(launcher.error,'');
assert.equal(calls.at(-1).args.folder,recovery.path,'Resume must reuse the created checkout');
liveSpaces=[{id:'existing',folder:recovery.path,machine:null,tabs:[{id:'tab'}]}];
livePanes=[{pane:'pane',cwd:recovery.path,tab:'tab',program:{agent:true}}];
const count=calls.filter(c=>c.name==='space.new'||c.name==='tab.new').length;
launcher.resume(cx);await drain();
assert.equal(calls.filter(c=>c.name==='space.new'||c.name==='tab.new').length,count,'Resume must focus an existing agent instead of starting a duplicate');
assert.equal(parseWorktrees(git('worktree','list','--porcelain','-z')).length,4);
console.log('PASS: actual launcher creates isolated worktrees, respects configured root, recovers after failed launch, avoids duplicate agents');
fs.rmSync(temp,{recursive:true,force:true});

// Removal must never implicitly close whichever unrelated space has focus.
const removeTemp=fs.mkdtempSync(path.join(os.tmpdir(),'herdr-dx-remove-test-'));
const removeRepo=path.join(removeTemp,'repo');fs.mkdirSync(removeRepo);
const rg=(...args)=>execFileSync('git',args,{cwd:removeRepo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
rg('init','-b','main');fs.writeFileSync(path.join(removeRepo,'file'),'base');rg('add','file');rg('-c','user.name=DX Test','-c','user.email=dx-test@example.invalid','commit','-m','base');
const cleanPath=path.join(removeTemp,'clean'),dirtyPath=path.join(removeTemp,'dirty');
rg('worktree','add','-b','clean',cleanPath);rg('worktree','add','-b','dirty',dirtyPath);
const cleanTop=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:cleanPath,encoding:'utf8'}).trim();
const dirtyTop=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:dirtyPath,encoding:'utf8'}).trim();
const removeMain=fs.realpathSync(removeRepo);
let removeProps={folder:cleanTop,action:'remove'},closeCalls=[];
const removeHost={...host,props:()=>removeProps,spaces:()=>[{id:'unrelated',machine:null,folder:removeMain,tabs:[]}],run:(n,a)=>closeCalls.push({n,a}),setShared(){}};
const removeImports={'gpui-kit':synthetic(ui),'gpui-base':synthetic({...baseUI,Scrollbar:{}}),'herdr':synthetic(removeHost)};
const removeModule=new vm.SourceTextModule(source('mods/dx-remove/main.js'),{context});
await removeModule.link(spec=>removeImports[spec]);await removeModule.evaluate();
const Remove=removeModule.namespace.default;
const makeRemove=(top)=>{const v=new Remove();v.repo={top,main:removeMain,linked:true};v.on=null;v.dirty=false;v.unpushed=[];return v;};
removeProps={folder:cleanTop,machine:'',action:'remove'};
const initializedRemove=new Remove();initializedRemove.init({},cx);await drain();
assert.equal(initializedRemove.on,null,'Local removal must normalize the app command machine selector before exec');
assert.equal(initializedRemove.error,'');assert.equal(initializedRemove.repo.top,cleanTop);
const cleanRemove=makeRemove(cleanTop);
assert.match(await cleanRemove.remove(),/Removal is paused/);
assert.equal(fs.existsSync(cleanTop),true);
assert.equal(closeCalls.length,0,'Paused removal must not close any space');
fs.writeFileSync(path.join(dirtyTop,'file'),'uncommitted');removeProps={folder:dirtyTop,action:'remove'};
const dirtyRemove=makeRemove(dirtyTop);
assert.match(await dirtyRemove.remove(),/Removal is paused/);
assert.equal(fs.readFileSync(path.join(dirtyTop,'file'),'utf8'),'uncommitted');
console.log('PASS: removal is disabled for both clean and dirty checkouts, without closing spaces');
fs.rmSync(removeTemp,{recursive:true,force:true});

// Reproduce the actual incident: shared state changes between inventory renders.
// The previous code called reload -> cx.notify during render and threw here.
function element() {
  const e=new Proxy({}, {get(_target,name){
    if(name==='when')return (condition,fn)=>condition?fn(e):e;
    return ()=>e;
  }});return e;
}
const inventoryHost={...host,openOverlay:()=>"test-overlay",nextCommand:()=>new Promise(()=>{})};
const inventoryHelper=new vm.SourceTextModule(source('mods/dx-worktrees/helpers.js'),{context});
const inventoryImports={'gpui-kit':synthetic({View:class{},div:element}),
 'gpui-base':synthetic({h_flex:element,v_flex:element}),
 'herdr':synthetic(inventoryHost),'./helpers.js':inventoryHelper};
const inventoryModule=new vm.SourceTextModule((process.env.DX_REGRESSION_INVENTORY ? fs.readFileSync(process.env.DX_REGRESSION_INVENTORY,'utf8') : source('mods/dx-worktrees/main.js')),{context});
await inventoryModule.link(spec=>inventoryImports[spec]);await inventoryModule.evaluate();
const Inventory=inventoryModule.namespace.default, inventory=new Inventory();
inventory.rows=[{path:'/removed/worktree',branch:'topic',dirty:false,merged:true,main:false}];
inventory.changed=0;inventory.loading=false;inventory.base='main';inventory.error='';
sharedState['dx.worktreeChange']=123;
const renderContext={notify(){throw new Error('cx.notify() is not allowed during render');},spawn(){throw new Error('No async work during render');}};
const callsBefore=calls.length;
assert.doesNotThrow(()=>inventory.render(renderContext));
assert.doesNotThrow(()=>inventory.render(renderContext));
assert.equal(calls.length,callsBefore);
assert.equal(inventory.rows.length,1,'Rendering must not mutate inventory data');
console.log('PASS: repeated inventory renders after a removal notification are free of reload/notify side effects');
