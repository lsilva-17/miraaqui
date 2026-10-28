import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as geometry from './public/canvas-geometry.js';

// Run the real UI handlers with a minimal DOM and an in-memory save endpoint.
// This covers gestures and undo without browser input limitations or production data.
async function ui(){
  const nodes=new Map(),requests=[],listeners=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},hidden:true,
      addEventListener(type,fn){listeners.set(selector+':'+type,fn)},setAttribute(){},focus(){},setPointerCapture(){},
      getBoundingClientRect(){return {left:0,top:0,width:1200,height:700}},querySelectorAll(){return []}});
    return nodes.get(selector);
  };
  const tools=['select','hand','sticky','text','rect','ellipse','diamond','line','pen','frame'].map(tool=>Object.assign(node('tool-'+tool),{dataset:{tool}}));
  const colors=Array.from({length:10},(_,i)=>Object.assign(node('color-'+i),{dataset:{noteColor:i===0?'#fff0a9':'#c9e8ff'}}));
  const document={querySelector:node,querySelectorAll:s=>s==='[data-tool]'?tools:s==='[data-note-color]'?colors:[],
    addEventListener(type,fn){listeners.set(type,fn)},documentElement:node('root')};
  const context=vm.createContext({...geometry,document,window:{addEventListener(){}},crypto:{randomUUID:()=>crypto.randomUUID()},
    structuredClone,setTimeout,clearTimeout,console,fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({})}}});
  const source=(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'').replace(/init\(\);\s*$/,'');
  vm.runInContext(source+'\nglobalThis.ui={state,vp,finishDrag,undo,redo,nodes:null};',context);
  const app=context.ui;app.state.board={id:'fixture'};app.state.pan={x:100,y:50};app.state.zoom=2;
  const target={dataset:{id:'source'},closest:s=>s==='[data-id]'?target:null};
  const event=(x,y,alt=true)=>({button:0,pointerId:1,clientX:x,clientY:y,altKey:alt,target,preventDefault(){}});
  return {...app,requests,node,tools,colors,event};
}

test('UI loads, registers all color choices and Alt drag saves one blank copy with reversible history',async()=>{
  const app=await ui(),source={id:'source',type:'sticky',x:100,y:100,w:240,h:190,color:'#c9e8ff',text:'Original'};
  app.state.objects.set(source.id,source);
  assert.ok(app.tools.every(b=>typeof b.onclick==='function'));
  assert.ok(app.colors.every(b=>typeof b.onclick==='function'));
  app.vp.onpointerdown(app.event(320,280));
  app.vp.onpointermove(app.event(560,400));
  app.vp.onpointerup(app.event(560,400));
  await app.state.pending;
  const copy=[...app.state.objects.values()].find(o=>o.id!=='source');
  assert.equal(app.state.objects.size,2);assert.equal(copy.x,220);assert.equal(copy.y,160);
  assert.equal(copy.w,240);assert.equal(copy.h,190);assert.equal(copy.color,source.color);assert.equal(copy.text,'');
  assert.deepEqual(app.state.objects.get('source'),source);
  const saves=app.requests.filter(r=>r.url.endsWith('/objects'));
  assert.equal(saves.length,1);assert.equal(saves[0].body.changes.length,1);
  app.undo();await app.state.pending;assert.equal(app.state.objects.size,1);assert.ok(app.state.objects.has('source'));
  app.redo();await app.state.pending;assert.equal(app.state.objects.get(copy.id).text,'');
});

test('Alt click and canceled Alt drag do not create a note or save a change',async()=>{
  for(const cancel of [false,true]){
    const app=await ui(),source={id:'source',type:'sticky',x:100,y:100,w:180,h:160,color:'#fff0a9',text:'Original'};
    app.state.objects.set(source.id,source);app.vp.onpointerdown(app.event(320,280));
    if(cancel){app.vp.onpointermove(app.event(560,400));app.finishDrag(true)}else app.vp.onpointerup(app.event(320,280));
    await app.state.pending;assert.equal(app.state.objects.size,1);assert.deepEqual(app.state.objects.get('source'),source);
    assert.equal(app.requests.filter(r=>r.url.endsWith('/objects')).length,0);
  }
});
