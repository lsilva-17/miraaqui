import lz from './vendor/lz-string.js';
import {propertyError,DEFAULT_FRAME_STYLE} from './element-properties.js';
import {DEFAULT_SHAPE_STYLE} from './shapes.js';
import {roadmapError} from './roadmap.js';

export const IMPORT_LIMIT=500,IMPORT_BYTES=5_500_000;
const TYPES=['sticky','rect','ellipse','diamond','triangle','hexagon','text','frame','line','pen','image','roadmap'];
const KEYS=['id','type','x','y','w','h','text','color','z','groupId','textStyle','shapeStyle','frameStyle','lineStyle','roadmap','src','points','free','from','to','fromPoint','toPoint','fromAnchor','toAnchor','fromSide','toSide'];
const COLORS={black:'#242124',grey:'#9c9a97','light-violet':'#e4dcf4',violet:'#976dcc',blue:'#219ebc','light-blue':'#cbeef3',yellow:'#fff0a9',orange:'#ffd5bc',green:'#9ececc','light-green':'#d5ead4',red:'#ffb8b8','light-red':'#ffc9dd',white:'#ffffff'};
const color=(value,fallback='#ffffff')=>/^#[a-f\d]{6}$/i.test(value||'')?value:COLORS[value]||fallback;
const number=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const TL_STROKE={black:'#1d1d1d',grey:'#9fa8b2','light-violet':'#e085f4',violet:'#ae3ec9',blue:'#4465e9','light-blue':'#4ba1f1',yellow:'#f1ac4b',orange:'#e16919',green:'#099268','light-green':'#4cb05e','light-red':'#f87777',red:'#e03131',white:'#ffffff'};
const TL_FILL={black:'#f2f2f2',grey:'#eceef0','light-violet':'#f5eafa',violet:'#eee1f5',blue:'#dce1f8','light-blue':'#dceefa',yellow:'#fbf2d4',orange:'#fae6d8',green:'#d9eee7','light-green':'#dbf0e0','light-red':'#f4dadb',red:'#f8d9d9',white:'#ffffff'};
const tlColor=(v,fallback='#242124')=>TL_STROKE[v]||color(v,fallback);
function miraaquiDefaults(objects){return objects.map(o=>({...o,...(o.textStyle||['sticky','rect','ellipse','diamond','triangle','hexagon','text','frame','line'].includes(o.type)?{textStyle:{fontFamily:'Poppins',fontSize:o.type==='text'?25:o.type==='frame'?15:17,color:o.textStyle?.color||'#1e131e',bold:o.type==='frame',italic:false,underline:false,align:['sticky','text','frame'].includes(o.type)?'left':'center',vertical:['sticky','text','frame'].includes(o.type)?'top':'middle'}}:{}),...(o.shapeStyle?{shapeStyle:{...o.shapeStyle,strokeWidth:2}}:{}),...(o.lineStyle?{lineStyle:{...o.lineStyle,width:2}}:{})}))}
const SIZE={s:16,m:20,l:28,xl:36,small:16,medium:20,large:28,'extra-large':36};
export function richText(value,depth=0){
  if(depth>24)return '';if(typeof value==='string')return value;if(!value||typeof value!=='object')return '';
  if(Array.isArray(value))return value.map(v=>richText(v,depth+1)).join('');
  if(value.type==='hardBreak')return '\n';if(typeof value.text==='string')return value.text;
  return richText(value.content,depth+1)+(value.type==='paragraph'?'\n':'');
}
export function htmlText(html){
  return String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,v=>{const chars={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(chars[v])return chars[v];const n=v.startsWith('&#x')?parseInt(v.slice(3),16):parseInt(v.slice(2),10);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/\n{3,}/g,'\n\n').trim();
}
function base(type,x=0,y=0,w=180,h=160,text='',fill='#ffffff'){if(String(text).length>20000)throw Error('Cada texto pode ter até 20 mil caracteres.');return {id:crypto.randomUUID(),type,x,y,w:Math.max(1,w),h:Math.max(1,h),text:String(text).slice(0,20000),color:fill,z:Date.now()}}
function textStyle(p={}){return {fontFamily:({sans:'Arial',serif:'Georgia',mono:'monospace'}[p.font]||'Poppins'),fontSize:Math.max(8,Math.min(144,number(p.fontSize,SIZE[p.size]||17))),color:color(p.color,'#242124'),align:({start:'left',middle:'center',end:'right',left:'left',center:'center',right:'right'}[p.textAlign||p.align]||'center'),vertical:['top','middle','bottom'].includes(p.verticalAlign)?p.verticalAlign:'middle'}}
export function validateImportedObject(o){
  if(!o||!TYPES.includes(o.type)||!['x','y','w','h'].every(k=>Number.isFinite(o[k])&&Math.abs(o[k])<=1e7)||o.w<=0||o.h<=0)throw Error('Há um elemento com tipo ou dimensões inválidas.');
  if(typeof o.text!=='string'||o.text.length>20000||!/^#[a-f\d]{6}$/i.test(o.color))throw Error('Há texto ou cor inválida no arquivo.');
  if(o.groupId!=null&&(typeof o.groupId!=='string'||o.groupId.length>200))throw Error('Grupo inválido no arquivo.');const error=propertyError({...o,groupId:undefined});if(error)throw Error(error);if(o.type==='roadmap'){const error=roadmapError(o.roadmap);if(error)throw Error(error)}
  if(o.type==='image'&&(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(o.src||'')||o.src.length>3_500_000))throw Error('Imagens precisam estar incorporadas como PNG/JPG/WebP/GIF. Cole-as como imagem na origem.');
  if(o.type==='pen'&&(!Array.isArray(o.points)||o.points.length<2||o.points.length>5000||o.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e7))))throw Error('Desenho inválido no arquivo.');
  if(o.type==='line'){
    if(o.free){if(!Array.isArray(o.points)||o.points.length!==2||o.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))throw Error('Linha inválida no arquivo.')}
    else for(const key of ['from','to']){if(!o[key]&&!(o[key+'Point']&&['x','y'].every(k=>Number.isFinite(o[key+'Point'][k])&&Math.abs(o[key+'Point'][k])<=1e7)))throw Error('Conexão incompleta no arquivo.');if(o[key+'Anchor']&&!['x','y'].every(k=>Number.isFinite(o[key+'Anchor'][k])&&o[key+'Anchor'][k]>=0&&o[key+'Anchor'][k]<=1))throw Error('Âncora inválida.');if(o[key+'Side']&&!['top','right','bottom','left'].includes(o[key+'Side']))throw Error('Lado da conexão inválido.')}
  }
  return o;
}
function validateBatch(objects){if(!objects.length)throw Error('Nenhum elemento compatível foi encontrado.');if(objects.length>IMPORT_LIMIT)throw Error('Importe até 500 elementos por vez.');objects.forEach(validateImportedObject);return objects}
export function placeImportedObjects(objects,point,newId=()=>crypto.randomUUID()){
  validateBatch(objects);const ids=new Map(),groups=new Map();for(const o of objects){if(ids.has(o.id))throw Error('O arquivo contém identificadores duplicados.');ids.set(o.id,newId());if(o.groupId&&!groups.has(o.groupId))groups.set(o.groupId,newId())}
  const os=objects.map((o,i)=>{const next={};for(const k of KEYS)if(o[k]!==undefined)next[k]=structuredClone(o[k]);Object.assign(next,{id:ids.get(o.id),z:Date.now()+i});if(next.groupId)next.groupId=groups.get(next.groupId);for(const key of ['from','to'])if(next[key]){if(!ids.has(next[key]))throw Error('Há uma conexão com elemento ausente. Importe os dois lados juntos.');next[key]=ids.get(next[key])}return next});
  const boxes=os.filter(o=>o.type!=='line'||o.free);const xs=boxes.map(o=>o.x),ys=boxes.map(o=>o.y);for(const o of os)if(o.type==='line'&&!o.free)for(const key of ['fromPoint','toPoint'])if(o[key]){xs.push(o[key].x);ys.push(o[key].y)}
  const left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...boxes.map(o=>o.x+o.w),...xs),bottom=Math.max(...boxes.map(o=>o.y+o.h),...ys),dx=point.x-(left+right)/2,dy=point.y-(top+bottom)/2;
  for(const o of os){if(o.type!=='line'||o.free){o.x+=dx;o.y+=dy}if(o.type==='line'&&!o.free)for(const k of ['fromPoint','toPoint'])if(o[k]){o[k].x+=dx;o[k].y+=dy}validateImportedObject(o)}
  if(new TextEncoder().encode(JSON.stringify(os)).length>3_700_000)throw Error('Este lote ficou grande demais. Cole menos elementos ou imagens de cada vez.');return os;
}
export function parseDelimited(text,delimiter){
  const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('O CSV tem aspas sem fechamento.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function textObjects(text,{csv=false,plain=false}={}){
  const trimmed=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();if(!trimmed)throw Error('Não há texto para importar.');
  if(plain||!csv&&!trimmed.includes('\n')&&!trimmed.includes('\t'))return validateBatch([base('text',0,0,Math.min(600,Math.max(240,trimmed.length*9)),Math.min(2000,Math.max(60,trimmed.split('\n').length*28)),trimmed,'#1e131e')]);
  const first=trimmed.split('\n')[0],delimiter=trimmed.includes('\t')?'\t':csv?(first.split(';').length>first.split(',').length?';':','):null;let rows=delimiter?parseDelimited(trimmed,delimiter):trimmed.split('\n').map(t=>[t]);
  if(csv&&/^(text|texto|content|conteúdo|conteudo)$/i.test(rows[0]?.[0]?.trim()))rows=rows.slice(1);
  const objects=[];rows.forEach((r,y)=>r.forEach((value,x)=>{if(value.trim()){if(objects.length>=IMPORT_LIMIT)throw Error('Importe até 500 elementos por vez.');objects.push(base('sticky',x*210,y*190,180,160,value.trim()))}}));return validateBatch(objects);
}
function freeLine(start,end,p={}){const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y),w=Math.max(1,Math.abs(start.x-end.x)),h=Math.max(1,Math.abs(start.y-end.y));return {...base('line',x,y,w,h,p.text||'',color(p.color,'#000000')),free:true,points:[[start.x,start.y],[end.x,end.y]].map(([a,b])=>[(a-x)/w,(b-y)/h]),lineStyle:{start:p.start||'none',end:p.end||'arrow',width:Math.max(1,Math.min(12,number(p.width,2))),pattern:p.pattern||'solid',route:p.route||'straight'}}}
function tldrawObjects(content){
  const records=content.shapes||content.records||Object.values(content.store||content.document?.store||{}),shapes=records.filter(s=>s.typeName==='shape'||s.props&&s.id?.startsWith('shape:')),bindings=content.bindings||records.filter(r=>r.typeName==='binding'),assets=new Map((content.assets||records.filter(r=>r.typeName==='asset')).map(a=>[a.id,a])),byId=new Map(shapes.map(s=>[s.id,s])),converted=new Map(),warnings=new Set();if(records.length>2000||bindings.length>2000)throw Error('O arquivo tem registros demais para uma importação. Selecione uma parte menor.');if(shapes.length>IMPORT_LIMIT)throw Error('Importe até 500 elementos por vez.');
  const origin=(shape,seen=new Set())=>{if(seen.has(shape.id))throw Error('Há um grupo circular no arquivo.');seen.add(shape.id);const parent=byId.get(shape.parentId),at=parent?origin(parent,seen):{x:0,y:0};return{x:at.x+number(shape.x),y:at.y+number(shape.y)}};
  for(const s of shapes){if(s.type==='group')continue;const p=s.props||{},at=origin(s),text=richText(p.richText||p.text||'').trim(),fill=p.fill==='semi'?'#fcfffe':TL_FILL[p.color]||color(p.color),w=number(p.w,s.type==='note'?200:180)*number(p.scale,1),h=(number(p.h,s.type==='note'?200:160)+number(p.growY))*number(p.scale,1);let o;
    if(s.rotation)warnings.add('Rotações foram convertidas em elementos sem rotação.');
    if(['note','geo','text','frame'].includes(s.type)){const type=s.type==='note'?'sticky':s.type==='geo'?({rectangle:'rect',ellipse:'ellipse',oval:'ellipse',diamond:'diamond',triangle:'triangle',hexagon:'hexagon'}[p.geo]||'rect'):s.type;
      if(s.type==='geo'&&!['rectangle','ellipse','oval','diamond','triangle','hexagon'].includes(p.geo))warnings.add('Algumas formas foram aproximadas como retângulos.');o=base(type,at.x,at.y,w,s.type==='text'?Math.max(45,text.split('\n').length*(SIZE[p.size]||20)*1.5):h,s.type==='frame'?p.name||'':text,type==='text'?color(p.color,'#242124'):s.type==='frame'?'#ffffff':fill);o.textStyle=textStyle({...p,color:tlColor(p.labelColor||'black'),textAlign:p.textAlign||p.align||(type==='text'?'start':'middle')});if(type==='sticky')o.textStyle.align=p.align==='middle'?'center':p.align||'left';if(['rect','ellipse','diamond','triangle','hexagon'].includes(type))o.shapeStyle={...DEFAULT_SHAPE_STYLE,strokeColor:tlColor(p.color),strokeWidth:({s:2,m:3.5,l:5,xl:10}[p.size]||2),pattern:p.dash==='dashed'?'dashed':p.dash==='dotted'?'dotted':'solid',opacity:p.fill==='none'?0:100};if(type==='frame')o.frameStyle={...DEFAULT_FRAME_STYLE};
    }else if(s.type==='arrow'||s.type==='line'){const points=s.type==='line'?Object.values(p.points||{}):[p.start,p.end];if(points.length<2){warnings.add('Uma linha sem pontos foi ignorada.');continue}o=freeLine({x:at.x+number(points[0].x),y:at.y+number(points[0].y)},{x:at.x+number(points.at(-1).x),y:at.y+number(points.at(-1).y)},{text,color:tlColor(p.color),start:['arrow','triangle'].includes(p.arrowheadStart)?'arrow':p.arrowheadStart==='dot'?'dot':'none',end:s.type==='line'?'none':['none','dot','diamond','square'].includes(p.arrowheadEnd)?p.arrowheadEnd:'arrow',route:p.kind==='elbow'?'elbow':p.bend?'curved':'straight',pattern:p.dash==='dashed'?'dashed':p.dash==='dotted'?'dotted':'solid'});
    }else if(s.type==='draw'){const points=(p.segments||[]).flatMap(s=>s.points||[]);if(points.length<2){warnings.add('Um desenho vazio foi ignorado.');continue}const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),dw=Math.max(1,Math.max(...points.map(p=>p.x))-x),dh=Math.max(1,Math.max(...points.map(p=>p.y))-y);o={...base('pen',at.x+x,at.y+y,dw,dh,'',color(p.color,'#242124')),points:points.slice(0,5000).map(p=>[(p.x-x)/dw,(p.y-y)/dh])};
    }else if(s.type==='image'){const src=assets.get(p.assetId)?.props?.src;if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(src||'')){warnings.add('Imagens por URL não foram baixadas. Cole-as como PNG/JPG da origem.');continue}o={...base('image',at.x,at.y,w,h),src};
    }else{warnings.add('Elementos sem equivalente ('+String(s.type).slice(0,30)+') foram ignorados.');continue}
    o.id=s.id;if(byId.get(s.parentId)?.type==='group')o.groupId=s.parentId;converted.set(s.id,o);
  }
  for(const s of shapes){const o=converted.get(s.id);if(o?.type!=='line')continue;const ends=o.points.map(p=>({x:o.x+p[0]*o.w,y:o.y+p[1]*o.h}));const links=bindings.filter(b=>b.fromId===s.id&&converted.has(b.toId));for(const binding of links){const key=binding.props?.terminal==='start'?'from':'to';if(o.free){delete o.free;delete o.points;o.fromPoint=ends[0];o.toPoint=ends[1]}o[key]=binding.toId;delete o[key+'Point'];const a=binding.props?.normalizedAnchor;if(a&&['x','y'].every(k=>Number.isFinite(a[k])&&a[k]>=0&&a[k]<=1))o[key+'Anchor']={x:a.x,y:a.y}}
  }
  return {objects:validateBatch(miraaquiDefaults([...converted.values()])),source:'tldraw',warnings:[...warnings]};
}
function excalidrawObjects(data){
  const elements=data.elements.filter(e=>!e.isDeleted),byId=new Map(elements.map(e=>[e.id,e])),converted=new Map(),warnings=new Set();if(elements.length>IMPORT_LIMIT)throw Error('Importe até 500 elementos por vez.');
  for(const e of elements){if(e.type==='text'&&e.containerId&&byId.has(e.containerId))continue;let o;const label=(e.boundElements||[]).map(b=>byId.get(b.id)).find(b=>b?.type==='text'),text=label?.text||e.text||'';
    if(['rectangle','ellipse','diamond','text'].includes(e.type)){o=base(e.type==='rectangle'?'rect':e.type,e.x,e.y,e.width,e.height,text,color(e.type==='text'?e.strokeColor:e.backgroundColor));o.textStyle={...textStyle({fontSize:label?.fontSize||e.fontSize,color:label?.strokeColor||e.strokeColor,textAlign:label?.textAlign||e.textAlign}),vertical:'middle'};if(e.type!=='text')o.shapeStyle={...DEFAULT_SHAPE_STYLE,strokeColor:color(e.strokeColor,'#242124'),strokeWidth:Math.min(12,e.strokeWidth||2),opacity:e.backgroundColor==='transparent'?0:100,pattern:['dashed','dotted'].includes(e.strokeStyle)?e.strokeStyle:'solid',radius:e.roundness?12:0};
    }else if(['arrow','line'].includes(e.type)){const points=e.points||[];if(points.length<2)continue;o=freeLine({x:e.x+points[0][0],y:e.y+points[0][1]},{x:e.x+points.at(-1)[0],y:e.y+points.at(-1)[1]},{text,color:e.strokeColor,width:e.strokeWidth,start:e.startArrowhead?'arrow':'none',end:e.type==='line'&&!e.endArrowhead?'none':'arrow',route:e.elbowed?'elbow':'straight',pattern:['dashed','dotted'].includes(e.strokeStyle)?e.strokeStyle:'solid'});
    }else if(e.type==='freedraw'){const points=e.points||[];if(points.length<2)continue;const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),w=Math.max(1,Math.max(...points.map(p=>p[0]))-x),h=Math.max(1,Math.max(...points.map(p=>p[1]))-y);o={...base('pen',e.x+x,e.y+y,w,h,'',color(e.strokeColor,'#242124')),points:points.slice(0,5000).map(p=>[(p[0]-x)/w,(p[1]-y)/h])};
    }else if(e.type==='image'&&data.files?.[e.fileId]?.dataURL){o={...base('image',e.x,e.y,e.width,e.height),src:data.files[e.fileId].dataURL}}else{warnings.add('Alguns elementos do Excalidraw não têm equivalente e foram ignorados.');continue}
    o.id=e.id;if(e.groupIds?.length)o.groupId=e.groupIds[0];if(e.angle)warnings.add('Rotações foram convertidas em elementos sem rotação.');converted.set(e.id,o);
  }
  for(const e of elements){const o=converted.get(e.id);if(o?.type!=='line')continue;for(const [prop,key]of [['startBinding','from'],['endBinding','to']])if(converted.has(e[prop]?.elementId)){if(o.free){const ends=o.points.map(p=>({x:o.x+p[0]*o.w,y:o.y+p[1]*o.h}));delete o.free;delete o.points;o.fromPoint=ends[0];o.toPoint=ends[1]}o[key]=e[prop].elementId;delete o[key+'Point']}}
  return {objects:validateBatch(miraaquiDefaults([...converted.values()])),source:'Excalidraw',warnings:[...warnings]};
}
export function decodeImportJson(value){
  let d=typeof value==='string'?JSON.parse(value):value;if(!d||typeof d!=='object')throw Error('JSON não reconhecido.');
  if(d.type==='application/tldraw'||d.kind==='content'&&d.data){if(d.version===3){const decoded=lz.decompressFromBase64(d.data.otherCompressed);if(!decoded||decoded.length>IMPORT_BYTES)throw Error('Dados comprimidos inválidos ou muito grandes.');d={...JSON.parse(decoded),assets:d.data.assets||[]}}else d=typeof d.data==='string'?JSON.parse(d.data):d.data}
  if(d.format==='elo'||d.format==='miraaqui-clipboard'){if(!Array.isArray(d.objects))throw Error('Arquivo Miraaqui inválido.');return {objects:validateBatch(d.objects),source:'Miraaqui',warnings:[]}}
  if(d.type==='excalidraw'||d.type==='excalidraw/clipboard')return excalidrawObjects(d);
  if(Array.isArray(d.shapes)||Array.isArray(d.records)||d.store||d.document?.store)return tldrawObjects(d);
  if(Array.isArray(d.items)||Array.isArray(d.data)&&d.data.some(e=>e.position&&e.type)){
    const warnings=[],objects=[];for(const item of d.items||d.data){const types={sticky_note:'sticky',shape:'rect',text:'text',frame:'frame'},type=types[item.type];if(!type){warnings.push('Itens sem equivalente foram ignorados.');continue}const w=number(item.geometry?.width,180),h=number(item.geometry?.height,160),o=base(type,number(item.position?.x)-w/2,number(item.position?.y)-h/2,w,h,htmlText(item.data?.content||item.data?.title||''),color(item.style?.fillColor));if(type==='rect'){o.type=({circle:'ellipse',rhombus:'diamond',triangle:'triangle',hexagon:'hexagon'}[item.data?.shape]||'rect');o.shapeStyle={...DEFAULT_SHAPE_STYLE}}if(type==='frame')o.frameStyle={...DEFAULT_FRAME_STYLE};objects.push(o)}return {objects:validateBatch(miraaquiDefaults(objects)),source:'Miro JSON',warnings:[...new Set(warnings)]};
  }
  throw Error('JSON não reconhecido. Use Miraaqui, tldraw ou Excalidraw; para Miro/FigJam, cole texto ou imagem.');
}
export function decodeClipboardContent({text='',html='',own='',plain=false}={}){
  if([text,html,own].some(s=>s.length>IMPORT_BYTES))throw Error('Cole até 5,5 MB de conteúdo por vez.');
  if(own&&!plain)return decodeImportJson(own);
  if(!plain&&html){const mira=html.match(/data-miraaqui="([^"]+)"/);if(mira)return decodeImportJson(decodeURIComponent(mira[1].replace(/&amp;/g,'&')));const tl=html.match(/<div\b[^>]*\bdata-tldraw\b[^>]*>([\s\S]*?)<\/div>/i);if(tl){const raw=tl[1].trim();let decoded;try{decoded=JSON.parse(raw)}catch{const json=lz.decompressFromBase64(raw);if(!json||json.length>IMPORT_BYTES)throw Error('Conteúdo tldraw inválido ou muito grande.');decoded=JSON.parse(json)}return decodeImportJson(decoded)}}
  const value=text.trim();if(!plain&&/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(value))return {svg:value,source:'SVG',warnings:[]};
  if(!plain&&/^[\[{]/.test(value)){try{return decodeImportJson(value)}catch(error){if(/"(?:format|shapes|records|elements|tldrawFileFormatVersion|type)"/.test(value))throw error}}
  if(!value&&/data-(?:figma|buffer|metadata)|figma/i.test(html))throw Error('Este conteúdo está no formato privado do Figma/FigJam. Na origem, use Copiar como SVG ou PNG e cole novamente.');
  const content=value||htmlText(html);return {objects:textObjects(content,{plain}),source:content.includes('\n')&&!plain?'Notas de texto':'Texto',warnings:[]};
}
export function sanitizeSvg(source){
  if(source.length>IMPORT_BYTES||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG inválido ou muito grande.');
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Não foi possível ler o SVG.');
  if(doc.querySelector('foreignObject'))throw Error('Este SVG contém conteúdo HTML. Exporte como PNG na origem para preservar a aparência.');
  const allowed=new Set(['svg','g','style','defs','path','rect','circle','ellipse','polygon','polyline','line','text','tspan','title','desc','clippath','mask','lineargradient','radialgradient','stop','pattern','use','image','filter','fegaussianblur','feoffset','fecolormatrix','femerge','femergenode','feblend','fecomposite','feflood']);let count=0;
  for(const el of [...doc.querySelectorAll('*')]){if(++count>15000)throw Error('O SVG tem detalhes demais. Exporte como PNG.');if(el.localName==='style'&&/@import|javascript:|url\(\s*['"]?(?!#)/i.test(el.textContent)){el.remove();continue}if(!allowed.has(el.localName.toLowerCase())){el.remove();continue}for(const attr of [...el.attributes]){const name=attr.name.toLowerCase(),value=attr.value;if(name.startsWith('on')||/javascript:|@import|expression\(/i.test(value)||/url\(\s*['"]?(?!#)/i.test(value)||(['href','xlink:href','src'].includes(name)&&!/^#|^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value)))el.removeAttribute(attr.name)}}
  const svg=doc.documentElement,view=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number),w=parseFloat(svg.getAttribute('width'))||view[2]||800,h=parseFloat(svg.getAttribute('height'))||view[3]||600;if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>50000||h>50000)throw Error('Dimensões do SVG inválidas.');svg.setAttribute('xmlns','http://www.w3.org/2000/svg');if(!svg.hasAttribute('viewBox'))svg.setAttribute('viewBox','0 0 '+w+' '+h);const scale=Math.min(1,4096/w,4096/h);svg.setAttribute('width',w*scale);svg.setAttribute('height',h*scale);return {source:new XMLSerializer().serializeToString(svg),w,h};
}
