export const TEXT_FONTS=['Poppins','Arial','Georgia','monospace'];
export const TEXT_TYPES=['sticky','rect','ellipse','diamond','text','frame'];
export function textFormat(o){return {fontFamily:'Poppins',fontSize:o.type==='text'?(o.h===35?14:25):o.type==='frame'?15:17,color:o.type==='text'?o.color:'#1e131e',bold:o.type==='frame',italic:false,underline:false,align:['sticky','text','frame'].includes(o.type)?'left':'center',vertical:['sticky','text','frame'].includes(o.type)?'top':'middle',...o.textStyle}}
export function textCss(o){const s=textFormat(o);return `font-family:${TEXT_FONTS.includes(s.fontFamily)?s.fontFamily:'Poppins'};font-size:${Number(s.fontSize)||17}px;font-weight:${s.bold?700:400};font-style:${s.italic?'italic':'normal'};text-decoration:${s.underline?'underline':'none'};text-align:${['left','center','right'].includes(s.align)?s.align:'left'};color:${/^#[a-f\d]{6}$/i.test(s.color)?s.color:'#1e131e'};`}
export function propertyError(o){
  if(o.locked!==undefined&&typeof o.locked!=='boolean')return 'Bloqueio inválido.';
  if(o.groupId!=null&&(typeof o.groupId!=='string'||! /^[\w-]{1,100}$/.test(o.groupId)))return 'Grupo inválido.';
  if(o.textStyle!==undefined){
    const s=o.textStyle;if(!s||typeof s!=='object'||Array.isArray(s))return 'Formato de texto inválido.';
    if(Object.keys(s).some(k=>!['fontFamily','fontSize','color','bold','italic','underline','align','vertical'].includes(k)))return 'Formato de texto inválido.';
    if(s.fontFamily!==undefined&&!TEXT_FONTS.includes(s.fontFamily))return 'Fonte inválida.';
    if(s.fontSize!==undefined&&(!Number.isFinite(s.fontSize)||s.fontSize<8||s.fontSize>144))return 'Tamanho de fonte inválido.';
    if(s.color!==undefined&&!/^#[a-f\d]{6}$/i.test(s.color))return 'Cor do texto inválida.';
    for(const k of ['bold','italic','underline'])if(s[k]!==undefined&&typeof s[k]!=='boolean')return 'Estilo de texto inválido.';
    if(s.align!==undefined&&!['left','center','right'].includes(s.align))return 'Alinhamento inválido.';
    if(s.vertical!==undefined&&!['top','middle','bottom'].includes(s.vertical))return 'Alinhamento vertical inválido.';
  }
  return null;
}
export function expandGroups(objects,ids){
  const result=new Set(ids.filter(id=>objects.has(id))),groups=new Set([...result].map(id=>objects.get(id).groupId).filter(Boolean));
  for(const o of objects.values())if(groups.has(o.groupId))result.add(o.id);
  return [...result];
}
export function elementLocked(objects,id){const o=objects.get(id);return !!o&&(!!o.locked||!!o.groupId&&[...objects.values()].some(p=>p.groupId===o.groupId&&p.locked))}
export function groupChanges(objects,ids,newId){const selected=expandGroups(objects,ids);if(selected.length<2||selected.some(id=>elementLocked(objects,id)))return [];const groupId=newId();return selected.map(id=>({id,object:{...objects.get(id),groupId}}))}
export function ungroupChanges(objects,ids){return expandGroups(objects,ids).filter(id=>objects.get(id).groupId&&!elementLocked(objects,id)).map(id=>({id,object:{...objects.get(id),groupId:null}}))}
export function lockChanges(objects,ids,locked){return expandGroups(objects,ids).map(id=>({id,object:{...objects.get(id),locked}}))}
export function formatChanges(objects,ids,patch){return ids.filter(id=>TEXT_TYPES.includes(objects.get(id)?.type)&&!elementLocked(objects,id)).map(id=>({id,object:{...objects.get(id),textStyle:{...objects.get(id).textStyle,...patch}}}))}
export function layerChanges(objects,ids,front){
  const values=[...objects.values()].map(o=>o.z||0),z=front?Math.max(0,...values)+1:Math.min(0,...values)-ids.length;
  return ids.filter(id=>!elementLocked(objects,id)&&!['frame','line','pen'].includes(objects.get(id)?.type)).map((id,i)=>({id,object:{...objects.get(id),z:z+i}}));
}
function box(items){const x=Math.min(...items.map(o=>o.x)),y=Math.min(...items.map(o=>o.y));return {x,y,w:Math.max(...items.map(o=>o.x+o.w))-x,h:Math.max(...items.map(o=>o.y+o.h))-y}}
export function arrangeChanges(objects,ids,mode){
  const selected=expandGroups(objects,ids);if(selected.some(id=>elementLocked(objects,id)))return [];
  const units=new Map();for(const id of selected){const o=objects.get(id);if(o.type==='line'&&!o.free)continue;const key=o.groupId||o.id;if(!units.has(key))units.set(key,[]);units.get(key).push(o)}
  const groups=[...units.values()].map(items=>({items,box:box(items)}));if(groups.length<2||mode.startsWith('distribute')&&groups.length<3)return [];
  const all=box(groups.map(g=>g.box)),changes=[];let targets;
  if(mode.startsWith('distribute')){const axis=mode==='distributeX'?'x':'y',size=axis==='x'?'w':'h';groups.sort((a,b)=>a.box[axis]-b.box[axis]);const first=groups[0].box[axis],last=groups.at(-1).box[axis]+groups.at(-1).box[size],gap=(last-first-groups.reduce((n,g)=>n+g.box[size],0))/(groups.length-1);let at=first;targets=groups.map(g=>{const t={x:g.box.x,y:g.box.y};t[axis]=at;at+=g.box[size]+gap;return t})}
  else targets=groups.map(g=>({x:mode==='left'?all.x:mode==='centerX'?all.x+(all.w-g.box.w)/2:mode==='right'?all.x+all.w-g.box.w:g.box.x,y:mode==='top'?all.y:mode==='centerY'?all.y+(all.h-g.box.h)/2:mode==='bottom'?all.y+all.h-g.box.h:g.box.y}));
  groups.forEach((g,i)=>{for(const o of g.items){const x=o.x+targets[i].x-g.box.x,y=o.y+targets[i].y-g.box.y;if(x!==o.x||y!==o.y)changes.push({id:o.id,object:{...o,x,y}})}});return changes;
}
