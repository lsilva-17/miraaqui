import {arrangeChanges,groupChanges,ungroupChanges,expandGroups,elementLocked,propertyError} from './public/element-properties.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {areaBetween,worldPoint,selectionInArea,connectionGeometry,segmentInArea,duplicateObjects,deletionIds,looseConnectionPath,resizedObject,newConnectedCard,emptyNoteCopy,newFreeArrow,snapPoint,DEFAULT_CARD_COLOR,DEFAULT_LINE_COLOR,attachmentAt,moveEndpoint,translateObject} from './public/canvas-geometry.js';
const a={id:'a',type:'sticky',x:100,y:100,w:100,h:80},b={id:'b',type:'rect',x:350,y:100,w:120,h:80},frame={id:'f',type:'frame',x:50,y:50,w:500,h:400};
test('Seleção funciona em ambas as direções e ignora o frame externo',()=>{const objects=new Map([a,b,frame].map(o=>[o.id,o]));assert.deepEqual(selectionInArea(objects,areaBetween({x:480,y:190},{x:90,y:90})),['a','b']);assert.deepEqual(selectionInArea(objects,{x:0,y:0,w:600,h:500}),['a','b','f']);assert.deepEqual(selectionInArea(objects,{x:201,y:181,w:40,h:20}),[])});
test('Conversão de coordenadas respeita deslocamento e zoom',()=>{assert.deepEqual(worldPoint(450,220,{x:150,y:20},2),{x:150,y:100});assert.deepEqual(worldPoint(75,30,{x:-25,y:-20},.5),{x:200,y:100})});
test('Setas ancoradas acompanham movimento e redimensionamento dos blocos',()=>{const objects=new Map([[a.id,a],[b.id,b]]),line={id:'l',type:'line',from:'a',to:'b',fromSide:'right'};let g=connectionGeometry(line,objects);assert.deepEqual(g.start,{x:200,y:140});assert.deepEqual(g.end,{x:350,y:140});assert.match(g.path,/ C/);objects.set('b',{...b,x:500,w:200});g=connectionGeometry(line,objects);assert.equal(g.end.x,500);assert.equal(connectionGeometry({...line,to:'missing'},objects),null)});
test('Seleciona conectores pela posição real, sem marcar o espaço vazio de um desenho',()=>{const line={id:'l',type:'line',from:'a',to:'b',x:0,y:0,w:1,h:1},pen={id:'p',type:'pen',x:600,y:100,w:100,h:100,points:[[0,0],[1,1]]},objects=new Map([a,b,line,pen].map(o=>[o.id,o]));assert.deepEqual(selectionInArea(objects,{x:250,y:135,w:20,h:10}),['l']);assert.deepEqual(selectionInArea(objects,{x:600,y:185,w:10,h:10}),[]);assert.equal(segmentInArea({x:-1,y:5},{x:12,y:5},{x:0,y:0,w:10,h:10}),true)});
test('Duplicar preserva as conexões internas entre os novos blocos e excluir inclui as setas ligadas',()=>{const line={id:'l',type:'line',from:'a',to:'b',fromSide:'right',x:0,y:0,w:1,h:1},objects=new Map([a,b,line].map(o=>[o.id,o]));let next=0;const copies=duplicateObjects(objects,['a','b'],()=>`copy-${++next}`);assert.equal(copies.length,3);assert.equal(copies[2].from,copies[0].id);assert.equal(copies[2].to,copies[1].id);assert.equal(copies[0].x,125);assert.equal(a.x,100);assert.deepEqual(deletionIds(objects,['a']),['a','l']);assert.deepEqual(deletionIds(objects,['a','b']),['a','b','l'])});
test('Cada bolinha cria a seta a partir do seu lado, inclusive na prévia',()=>{const objects=new Map([[a.id,a],[b.id,b]]);for(const[side,point,axis,direction]of [['top',{x:150,y:100},'y',-1],['right',{x:200,y:140},'x',1],['bottom',{x:150,y:180},'y',1],['left',{x:100,y:140},'x',-1]]){const g=connectionGeometry({from:'a',to:'b',fromSide:side,toSide:'top'},objects);assert.deepEqual(g.start,point);assert.deepEqual(g.end,{x:410,y:100});assert.ok((g.c1[axis]-point[axis])*direction>0);assert.ok(looseConnectionPath(a,{x:500,y:300},side).startsWith(`M${point.x} ${point.y} C`))}});
test('Os quatro cantos redimensionam sem deslocar o canto oposto e respeitam o tamanho mínimo',()=>{assert.deepEqual(resizedObject(a,{x:-20,y:-10},'nw'),{...a,x:80,y:90,w:120,h:90});assert.deepEqual(resizedObject(a,{x:20,y:-10},'ne'),{...a,y:90,w:120,h:90});assert.deepEqual(resizedObject(a,{x:-20,y:10},'sw'),{...a,x:80,w:120,h:90});assert.deepEqual(resizedObject(a,{x:20,y:10},'se'),{...a,w:120,h:90});const minimum=resizedObject(a,{x:999,y:999},'nw');assert.equal(minimum.w,50);assert.equal(minimum.h,35);assert.equal(minimum.x+minimum.w,a.x+a.w);assert.equal(minimum.y+minimum.h,a.y+a.h)});
test('Soltar a seta cria card centralizado na posição do ponteiro e uma ligação para a origem',()=>{for(const side of ['top','right','bottom','left']){let n=0;const source={...a,color:'#fff0a9'},point=worldPoint(700,350,{x:100,y:50},2),{card,line}=newConnectedCard(source,point,side,()=>`new-${++n}`);assert.equal(card.x+card.w/2,point.x);assert.equal(card.y+card.h/2,point.y);assert.equal(card.type,source.type);assert.equal(card.color,DEFAULT_CARD_COLOR);assert.equal(line.from,source.id);assert.equal(line.to,card.id);assert.equal(line.fromSide,side);assert.notEqual(card.id,line.id);assert.ok(connectionGeometry(line,new Map([[source.id,source],[card.id,card]])));assert.equal(source.x,100)}});
test('Conectar a partir de imagem ou frame cria nota, sem copiar conteúdo de origem',()=>{for(const type of ['image','frame','text']){let id=0;const {card,line}=newConnectedCard({...a,type,text:'Texto original',src:'data:image/png;base64,abc'},{x:-200,y:-100},'bottom',()=>`copy-${++id}`);assert.equal(card.type,'sticky');assert.equal(card.text,'Nova ideia');assert.equal(card.src,undefined);assert.equal(card.w,180);assert.equal(card.h,160);assert.equal(card.x+90,-200);assert.equal(card.y+80,-100);assert.equal(line.from,'a')}});
test('Alt e arraste copia tamanho e cor da nota com texto vazio e sem alterar a origem',()=>{const source={...a,text:'Texto que não deve ser copiado',color:'#c9e8ff',w:240,h:190},copy=emptyNoteCopy(source,'copy');assert.equal(copy.id,'copy');assert.equal(copy.type,'sticky');assert.equal(copy.text,'');assert.equal(copy.w,240);assert.equal(copy.h,190);assert.equal(copy.color,'#c9e8ff');copy.x+=80;copy.y+=35;assert.equal(source.x,100);assert.equal(source.y,100);assert.equal(source.text,'Texto que não deve ser copiado');assert.equal(copy.x,180);assert.equal(copy.y,135)});
test('Setas livres respeitam sentido do arraste, linhas horizontais e verticais e movimento posterior',()=>{for(const[start,end]of [[{x:0,y:0},{x:200,y:100}],[{x:200,y:100},{x:0,y:0}],[{x:20,y:20},{x:20,y:200}],[{x:20,y:20},{x:200,y:20}]]){const arrow=newFreeArrow(start,end,'free');const g=connectionGeometry(arrow,new Map());assert.deepEqual(g.start,start);assert.deepEqual(g.end,end);assert.ok(arrow.w>0&&arrow.h>0);const moved=connectionGeometry({...arrow,x:arrow.x+40,y:arrow.y+25},new Map());assert.deepEqual(moved.start,{x:start.x+40,y:start.y+25});assert.deepEqual(moved.end,{x:end.x+40,y:end.y+25})}});


test('Shift encaixa o ponto em 30 graus em todos os quadrantes, com eixos exatos',()=>{
  const origin={x:-120,y:37};
  assert.deepEqual(snapPoint(origin,origin),origin);
  assert.deepEqual(snapPoint(origin,{x:-20,y:47}),{x:-20,y:37});
  assert.deepEqual(snapPoint(origin,{x:-110,y:137}),{x:-120,y:137});
  for(let degrees=0;degrees<360;degrees+=30){const angle=(degrees+7)*Math.PI/180,p=snapPoint(origin,{x:origin.x+150*Math.cos(angle),y:origin.y+150*Math.sin(angle)});const result=(Math.atan2(p.y-origin.y,p.x-origin.x)*180/Math.PI+360)%360;assert.ok(Math.abs(result-degrees)<1e-9);assert.ok(Math.hypot(p.x-origin.x,p.y-origin.y)<=150+1e-9)}
});
test('Novos cards são brancos e setas são pretas; cópia Alt mantém a cor escolhida',()=>{
  let id=0;const source={...a,color:'#ffb8b8'},pair=newConnectedCard(source,{x:500,y:300},'right',()=>String(++id));
  assert.equal(pair.card.color,'#ffffff');assert.equal(pair.line.color,'#000000');assert.equal(newFreeArrow({x:0,y:0},{x:100,y:20},'line').color,'#000000');assert.equal(emptyNoteCopy(source,'copy').color,source.color);
});


test('Alinhar respeita grupos como unidades e distribuir mantém os extremos',()=>{
  const os=[{...a,groupId:'g'},{...b,groupId:'g'},{...a,id:'c',x:800,y:300},{...a,id:'d',x:1000,y:500}],map=new Map(os.map(o=>[o.id,o]));
  const changes=arrangeChanges(map,['a','c'],'top');const shifted=changes.find(c=>c.id==='c').object;assert.equal(shifted.y,100);assert.equal(changes.some(c=>c.id==='a'||c.id==='b'),false);
  const dist=arrangeChanges(map,['a','c','d'],'distributeX');const moved=dist.find(c=>c.id==='c').object;assert.equal(moved.x,685);assert.equal(dist.some(c=>c.id==='a'||c.id==='b'||c.id==='d'),false);
});

test('Grupos bloqueados não entram na seleção por área e não podem ser agrupados novamente',()=>{
  const map=new Map([[a.id,{...a,groupId:'g',locked:true}],[b.id,{...b,groupId:'g'}]]);assert.equal(elementLocked(map,'b'),true);assert.deepEqual(selectionInArea(map,{x:0,y:0,w:1000,h:1000}),[]);assert.deepEqual(expandGroups(map,['a']),['a','b']);assert.deepEqual(groupChanges(map,['a','b'],()=> 'new'),[]);assert.deepEqual(ungroupChanges(map,['a']),[]);
});

test('Validação de texto impede CSS arbitrário e tamanhos inválidos',()=>{
  assert.equal(propertyError({textStyle:{fontFamily:'Poppins',fontSize:24,bold:true,color:'#f0612d',vertical:'middle'}}),null);
  for(const style of [{fontFamily:'url(evil)'},{fontSize:1},{fontSize:Infinity},{color:'red;display:none'},{position:'fixed'},{align:'evil'}])assert.ok(propertyError({textStyle:style}));
});


test('Pontas podem mudar de lado e manter um ponto personalizado após mover o bloco',()=>{
  const objects=new Map([[a.id,a],[b.id,b]]),line={id:'line',type:'line',from:'a',to:'b',fromSide:'top',color:'#000000',x:0,y:0,w:1,h:1};
  const changed=moveEndpoint(line,'start',{x:101,y:130},attachmentAt(a,{x:101,y:130}),objects);assert.equal(changed.fromSide,'left');assert.deepEqual(connectionGeometry(changed,objects).start,{x:100,y:130});
  objects.set('a',{...a,x:200,h:160});assert.deepEqual(connectionGeometry(changed,objects).start,{x:200,y:160});assert.equal(line.fromSide,'top');
});
test('Desprender uma ponta preserva a outra conexão e desprender ambas cria seta livre',()=>{
  const objects=new Map([[a.id,a],[b.id,b]]),line={id:'line',type:'line',from:'a',to:'b',fromSide:'right',color:'#f0612d',groupId:'g',x:0,y:0,w:1,h:1};
  const dangling=moveEndpoint(line,'end',{x:700,y:300},null,objects);assert.equal(dangling.from,'a');assert.equal(dangling.to,undefined);assert.deepEqual(connectionGeometry(dangling,objects).end,{x:700,y:300});
  const free=moveEndpoint(dangling,'start',{x:50,y:60},null,objects);assert.equal(free.free,true);assert.equal(free.color,'#f0612d');assert.equal(free.groupId,'g');assert.deepEqual(connectionGeometry(free,objects).start,{x:50,y:60});assert.deepEqual(connectionGeometry(free,objects).end,{x:700,y:300});
});
test('Seta livre pode se reconectar a um bloco e pontas soltas acompanham duplicação',()=>{
  const objects=new Map([[b.id,b]]),line=newFreeArrow({x:10,y:20},{x:200,y:100},'free');
  const attached=moveEndpoint(line,'end',{x:351,y:140},attachmentAt(b,{x:351,y:140}),objects);assert.equal(attached.to,'b');assert.deepEqual(connectionGeometry(attached,objects).start,{x:10,y:20});assert.deepEqual(connectionGeometry(attached,objects).end,{x:350,y:140});
  const translated=translateObject(attached,{x:25,y:35});assert.deepEqual(translated.fromPoint,{x:35,y:55});assert.equal(translated.to,'b');
});
