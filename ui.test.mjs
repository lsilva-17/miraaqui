import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as geometry from './public/canvas-geometry.js';
import * as properties from './public/element-properties.js';

// Run the real UI handlers with a minimal DOM and an in-memory save endpoint.
// This covers gestures and undo without browser input limitations or production data.
async function ui(){
  const nodes=new Map(),requests=[],listeners=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},hidden:true,
      addEventListener(type,fn){listeners.set(selector+':'+type,fn)},setAttribute(){},focus(){},setPointerCapture(){},contains(){return true},
      getBoundingClientRect(){return {left:0,top:0,width:1200,height:700}},querySelectorAll(){return []}});
    return nodes.get(selector);
  };
  const tools=['select','hand','sticky','text','rect','ellipse','diamond','line','pen','frame'].map(tool=>Object.assign(node('tool-'+tool),{dataset:{tool}}));
  const colors=Array.from({length:10},(_,i)=>Object.assign(node('color-'+i),{dataset:{noteColor:i===0?'#fff0a9':'#c9e8ff'}}));
  const document={querySelector:node,querySelectorAll:s=>s==='[data-tool]'?tools:s==='[data-note-color]'?colors:[],
    elementsFromPoint(){return []},elementFromPoint(){return {closest(){return null}}},getElementById(id){return node(id)},addEventListener(type,fn){listeners.set(type,fn)},documentElement:node('root')};
  const context=vm.createContext({...geometry,...properties,document,window:{addEventListener(){}},crypto:{randomUUID:()=>crypto.randomUUID()},
    structuredClone,setTimeout,clearTimeout,console,fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({})}}});
  const source=(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'').replace(/init\(\);\s*$/,'');
  vm.runInContext(source+'\nglobalThis.ui={state,vp,finishDrag,undo,redo,selectObjects,changeDragConstraint,groupSelection,ungroupSelection,toggleSelectionLock,formatSelection,arrangeSelection,orderSelection,deleteSelected,copySelection,pasteSelection,setSelectionColor,nodes:null};',context);
  const app=context.ui;app.state.board={id:'fixture'};app.state.pan={x:100,y:50};app.state.zoom=2;
  const target={dataset:{id:'source'},closest:s=>s==='[data-id]'?target:null};
  const event=(x,y,alt=true)=>({button:0,pointerId:1,clientX:x,clientY:y,altKey:alt,target,preventDefault(){}});
  return {...app,requests,node,tools,colors,event,listeners};
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

const sticky=()=>({id:'source',type:'sticky',x:100,y:100,w:180,h:160,color:'#c9e8ff',text:'Original'});
const near=(value,expected)=>assert.ok(Math.abs(value-expected)<1e-8,value+' != '+expected);
function pointer(app,x,y,{shift=false,alt=false,blank=false}={}){return {...app.event(x,y,alt),shiftKey:shift,...(blank?{target:{closest(){return null}}}:{})}}

test('Shift arrasta uma nota já selecionada no eixo horizontal e preserva Shift clique',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());app.selectObjects(['source']);
  app.vp.onpointerdown(pointer(app,320,280,{shift:true}));app.vp.onpointermove(pointer(app,560,300,{shift:true}));app.vp.onpointerup(pointer(app,560,300,{shift:true}));await app.state.pending;
  assert.equal(app.state.objects.get('source').x,220);assert.equal(app.state.objects.get('source').y,100);assert.equal(app.state.selection.size,1);
  app.undo();await app.state.pending;assert.equal(app.state.objects.get('source').x,100);
  app.vp.onpointerdown(pointer(app,320,280,{shift:true}));app.vp.onpointerup(pointer(app,320,280,{shift:true}));await app.state.pending;assert.equal(app.state.selection.size,0);
  app.vp.onpointerdown(pointer(app,320,280,{shift:true}));app.vp.onpointerup(pointer(app,320,280,{shift:true}));assert.equal(app.state.selection.size,1);
});

test('Pressionar e soltar Shift durante o arraste atualiza a prévia sem acumular deslocamentos',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());
  app.vp.onpointerdown(pointer(app,320,280));app.vp.onpointermove(pointer(app,560,300));assert.equal(app.state.objects.get('source').y,110);
  app.changeDragConstraint(true);assert.equal(app.state.objects.get('source').y,100);assert.match(app.node('#dragGuide').innerHTML,/0°/);
  app.changeDragConstraint(false);assert.equal(app.state.objects.get('source').y,110);assert.equal(app.node('#dragGuide').innerHTML,'');
  app.vp.onpointerup(pointer(app,560,300,{shift:true}));await app.state.pending;assert.equal(app.state.objects.get('source').y,100);assert.equal(app.node('#dragGuide').innerHTML,'');
});

test('Grupo com nota e seta livre mantém espaçamento e direção de 30 graus',async()=>{
  const app=await ui(),line=geometry.newFreeArrow({x:400,y:100},{x:500,y:100},'line');app.state.objects.set('source',sticky());app.state.objects.set('line',line);app.selectObjects(['source','line']);
  app.vp.onpointerdown(pointer(app,320,280,{shift:true}));app.vp.onpointermove(pointer(app,560,400,{shift:true}));app.vp.onpointerup(pointer(app,560,400,{shift:true}));await app.state.pending;
  const note=app.state.objects.get('source'),arrow=app.state.objects.get('line');near((note.y-100)/(note.x-100),Math.tan(Math.PI/6));near(arrow.x-note.x,300);near(arrow.y-note.y,0);assert.equal(app.state.selection.size,2);
  app.undo();await app.state.pending;assert.equal(app.state.objects.get('source').x,100);assert.equal(app.state.objects.get('line').x,400);
});

test('Alt com Shift cria cópia vazia alinhada verticalmente e Escape cancela',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());app.vp.onpointerdown(pointer(app,320,280,{alt:true,shift:true}));app.vp.onpointermove(pointer(app,340,500,{alt:true,shift:true}));app.vp.onpointerup(pointer(app,340,500,{alt:true,shift:true}));await app.state.pending;
  const copy=[...app.state.objects.values()].find(o=>o.id!=='source');assert.equal(copy.x,100);assert.equal(copy.y,210);assert.equal(copy.text,'');assert.equal(copy.color,'#c9e8ff');assert.equal(app.state.objects.get('source').y,100);
  app.undo();await app.state.pending;app.vp.onpointerdown(pointer(app,320,280,{shift:true}));app.vp.onpointermove(pointer(app,560,400,{shift:true}));app.finishDrag(true);assert.equal(app.state.objects.get('source').x,100);assert.equal(app.node('#dragGuide').innerHTML,'');
});

test('Seta livre preta salva o mesmo ângulo de 30 graus mostrado na prévia',async()=>{
  const app=await ui();app.state.tool='line';app.vp.onpointerdown(pointer(app,400,350,{blank:true}));app.vp.onpointermove(pointer(app,640,470,{blank:true,shift:true}));assert.match(app.node('#dragGuide').innerHTML,/30°/);
  app.vp.onpointerup(pointer(app,640,470,{blank:true,shift:true}));await app.state.pending;const arrow=[...app.state.objects.values()][0],g=geometry.connectionGeometry(arrow,app.state.objects);near((g.end.y-g.start.y)/(g.end.x-g.start.x),Math.tan(Math.PI/6));assert.equal(arrow.color,'#000000');assert.match(app.node('#links').innerHTML,/stroke="#000000"/);
  app.undo();await app.state.pending;assert.equal(app.state.objects.size,0);app.redo();await app.state.pending;assert.equal(app.state.objects.size,1);
});

test('Ferramentas criam formas brancas e texto escuro por padrão',async()=>{
  for(const type of ['rect','ellipse','diamond','frame','text']){const app=await ui();app.state.tool=type;app.vp.onpointerdown(pointer(app,500,400,{blank:true}));await app.state.pending;assert.equal([...app.state.objects.values()][0].color,type==='text'?'#1e131e':'#ffffff')}
});


test('Shift na bolinha cria card branco alinhado e seta preta com uma única ação de desfazer',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());
  const handle={dataset:{side:'right'}},target={dataset:{id:'source'},closest:s=>s==='[data-id]'?target:s==='.connection-handle'?handle:null};
  app.vp.onpointerdown({...pointer(app,698,410,{shift:true}),target});app.vp.onpointermove({...pointer(app,1080,460,{shift:true}),target});app.vp.onpointerup({...pointer(app,1080,460,{shift:true}),target});await app.state.pending;
  const card=[...app.state.objects.values()].find(o=>o.type==='sticky'&&o.id!=='source'),line=[...app.state.objects.values()].find(o=>o.type==='line');
  near(card.y+card.h/2,180);assert.equal(card.color,'#ffffff');assert.equal(line.color,'#000000');assert.equal(app.state.objects.size,3);app.undo();await app.state.pending;assert.equal(app.state.objects.size,1);
});


test('Agrupar persiste seleção conjunta, formata o grupo e desfaz cada ação',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());app.state.objects.set('second',{...sticky(),id:'second',x:400});app.selectObjects(['source','second']);app.groupSelection();await app.state.pending;
  const group=app.state.objects.get('source').groupId;assert.ok(group);assert.equal(app.state.objects.get('second').groupId,group);app.selectObjects(['source']);assert.equal(app.state.selection.size,2);
  app.formatSelection({fontFamily:'Georgia',fontSize:28,bold:true,align:'center',color:'#045077'});await app.state.pending;for(const o of app.state.objects.values())assert.equal(o.textStyle.fontSize,28);
  app.undo();await app.state.pending;assert.equal(app.state.objects.get('source').textStyle,undefined);assert.equal(app.state.objects.get('source').groupId,group);
  app.ungroupSelection();await app.state.pending;app.selectObjects(['source']);assert.equal(app.state.selection.size,1);app.undo();await app.state.pending;app.selectObjects(['source']);assert.equal(app.state.selection.size,2);
  app.selectObjects(['source'],false);assert.equal(app.state.selection.size,1);app.formatSelection({fontSize:36});await app.state.pending;assert.equal(app.state.objects.get('source').textStyle.fontSize,36);assert.equal(app.state.objects.get('second').textStyle,undefined);
});

test('Bloqueio impede movimento, exclusão e formatação até desbloquear',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());app.selectObjects(['source']);app.toggleSelectionLock();await app.state.pending;assert.equal(app.state.objects.get('source').locked,true);
  app.vp.onpointerdown(pointer(app,320,280));app.vp.onpointermove(pointer(app,560,400));app.vp.onpointerup(pointer(app,560,400));app.setSelectionColor('#ffb8b8');app.formatSelection({fontSize:40});app.deleteSelected();await app.state.pending;
  assert.equal(app.state.objects.size,1);assert.equal(app.state.objects.get('source').x,100);assert.equal(app.state.objects.get('source').textStyle,undefined);assert.equal(app.state.objects.get('source').color,'#c9e8ff');
  app.toggleSelectionLock();await app.state.pending;app.formatSelection({fontSize:40});await app.state.pending;assert.equal(app.state.objects.get('source').textStyle.fontSize,40);
});

test('Copiar e colar preserva fonte e cria um grupo independente',async()=>{
  const app=await ui();app.state.objects.set('source',{...sticky(),groupId:'old-group',textStyle:{fontSize:23,italic:true}});app.state.objects.set('second',{...sticky(),id:'second',groupId:'old-group',x:400});app.selectObjects(['source']);app.copySelection();app.pasteSelection({x:700,y:500});await app.state.pending;
  const copies=[...app.state.objects.values()].filter(o=>!['source','second'].includes(o.id));assert.equal(copies.length,2);assert.notEqual(copies[0].groupId,'old-group');assert.equal(copies[0].groupId,copies[1].groupId);assert.equal(copies[0].textStyle.fontSize,23);assert.equal(copies[0].x,700);app.undo();await app.state.pending;assert.equal(app.state.objects.size,2);
});

test('Paleta aplica HEX personalizado ao conjunto e permite desfazer',async()=>{
  const app=await ui();app.state.objects.set('source',sticky());app.state.objects.set('second',{...sticky(),id:'second',x:400});app.selectObjects(['source','second']);app.setSelectionColor('#f0612d');await app.state.pending;assert.ok([...app.state.objects.values()].every(o=>o.color==='#f0612d'));app.undo();await app.state.pending;assert.ok([...app.state.objects.values()].every(o=>o.color==='#c9e8ff'));
});


test('Selecionar individualmente dentro de um grupo exclui somente aquele membro',async()=>{
  const app=await ui();app.state.objects.set('source',{...sticky(),groupId:'g'});app.state.objects.set('second',{...sticky(),id:'second',groupId:'g',x:400});app.selectObjects(['source'],false);app.deleteSelected();await app.state.pending;assert.equal(app.state.objects.size,1);assert.ok(app.state.objects.has('second'));app.undo();await app.state.pending;assert.equal(app.state.objects.size,2);
});


test('Alterar cor de texto formatado atualiza a cor visível e preserva a fonte',async()=>{
  const app=await ui();app.state.objects.set('source',{...sticky(),type:'text',color:'#000000',textStyle:{color:'#045077',fontSize:30,bold:true}});app.selectObjects(['source']);app.setSelectionColor('#f0612d');await app.state.pending;const o=app.state.objects.get('source');assert.equal(o.color,'#f0612d');assert.equal(o.textStyle.color,'#f0612d');assert.equal(o.textStyle.fontSize,30);assert.equal(o.textStyle.bold,true);
});
