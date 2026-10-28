import {elementLocked} from './element-properties.js';
export function worldPoint(x,y,pan,zoom){return{x:(x-pan.x)/zoom,y:(y-pan.y)/zoom}}
export const DEFAULT_CARD_COLOR='#ffffff',DEFAULT_LINE_COLOR='#000000';
export function snapPoint(start,point){
  const dx=point.x-start.x,dy=point.y-start.y;
  if(!dx&&!dy)return {...start};
  const step=Math.PI/6,angle=Math.round(Math.atan2(dy,dx)/step)*step;
  const c=Math.abs(Math.cos(angle))<1e-12?0:Math.cos(angle),s=Math.abs(Math.sin(angle))<1e-12?0:Math.sin(angle),distance=dx*c+dy*s;
  return{x:start.x+distance*c,y:start.y+distance*s};
}
export function areaBetween(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)}}
function contains(r,p){return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h}
function intersects(a,b){return a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y}
export function segmentInArea(a,b,r){
  let low=0,high=1;
  for(const [start,delta,min,max]of [[a.x,b.x-a.x,r.x,r.x+r.w],[a.y,b.y-a.y,r.y,r.y+r.h]]){
    if(delta===0){if(start<min||start>max)return false;continue}
    const t1=(min-start)/delta,t2=(max-start)/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
  }return true;
}
const normals=Object.assign(Object.create(null),{left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}});
export function looseConnectionPath(o,point,side='right'){
  const normal=normals[side]||normals.right,start=edgePoint(o,point,side),distance=Math.max(45,Math.min(180,Math.hypot(point.x-start.x,point.y-start.y)/2));
  return `M${start.x} ${start.y} C${start.x+normal.x*distance} ${start.y+normal.y*distance} ${point.x-normal.x*distance} ${point.y-normal.y*distance} ${point.x} ${point.y}`;
}
export function resizedObject(original,delta,corner='se'){
  const west=corner.includes('w'),north=corner.includes('n'),w=Math.max(50,original.w+(west?-delta.x:delta.x)),h=Math.max(35,original.h+(north?-delta.y:delta.y));
  return{...original,w,h,x:west?original.x+original.w-w:original.x,y:north?original.y+original.h-h:original.y};
}
export function newConnectedCard(source,point,side,newId){
  const sameType=['sticky','rect','ellipse','diamond'].includes(source.type);
  const card={id:newId(),type:sameType?source.type:'sticky',x:0,y:0,w:sameType?source.w:180,h:sameType?source.h:160,text:'Nova ideia',color:DEFAULT_CARD_COLOR,z:Date.now()};
  card.x=point.x-card.w/2;card.y=point.y-card.h/2;
  const line={id:newId(),type:'line',x:0,y:0,w:1,h:1,text:'',color:DEFAULT_LINE_COLOR,from:source.id,to:card.id,fromSide:side,z:Date.now()+1};
  return{card,line};
}
export function emptyNoteCopy(source,id){return{id,type:'sticky',x:source.x,y:source.y,w:source.w,h:source.h,text:'',color:source.color,...(source.textStyle?{textStyle:structuredClone(source.textStyle)}:{}),z:Date.now()}}
export function newFreeArrow(start,end,id){
  const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y),w=Math.max(1,Math.abs(end.x-start.x)),h=Math.max(1,Math.abs(end.y-start.y));
  return{id,type:'line',free:true,x,y,w,h,points:[[start.x,start.y],[end.x,end.y]].map(p=>[(p[0]-x)/w,(p[1]-y)/h]),text:'',color:DEFAULT_LINE_COLOR,z:Date.now()};
}
export function edgePoint(o,target,side){
  const center={x:o.x+o.w/2,y:o.y+o.h/2};
  if(normals[side])return{x:center.x+normals[side].x*o.w/2,y:center.y+normals[side].y*o.h/2};
  let dx=target.x-center.x,dy=target.y-center.y;if(dx===0&&dy===0)dx=1;
  const rx=o.w/2,ry=o.h/2;
  const ratio=o.type==='ellipse'?1/Math.sqrt((dx/rx)**2+(dy/ry)**2):o.type==='diamond'?1/(Math.abs(dx)/rx+Math.abs(dy)/ry):Math.min(rx/(Math.abs(dx)||1e-9),ry/(Math.abs(dy)||1e-9));
  return{x:center.x+dx*ratio,y:center.y+dy*ratio};
}
export function connectionGeometry(line,objects){
  if(line.free){const[start,end]=line.points.map(p=>({x:line.x+p[0]*line.w,y:line.y+p[1]*line.h}));return{start,end,path:`M${start.x} ${start.y} L${end.x} ${end.y}`,points:[start,end]}}
  const a=objects.get(line.from),b=objects.get(line.to);if(!a||!b)return null;
  const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2};
  const curved=!!normals[line.fromSide];
  let toSide=normals[line.toSide]?line.toSide:null;
  if(curved&&!toSide){const dx=ac.x-bc.x,dy=ac.y-bc.y;toSide=Math.abs(dx)/(b.w/2)>=Math.abs(dy)/(b.h/2)?dx<0?'left':'right':dy<0?'top':'bottom'}
  const start=edgePoint(a,bc,line.fromSide),end=edgePoint(b,ac,toSide);
  if(!curved)return{start,end,path:`M${start.x} ${start.y} L${end.x} ${end.y}`,points:[start,end]};
  const distance=Math.max(45,Math.min(180,Math.hypot(end.x-start.x,end.y-start.y)/2));
  const n1=normals[line.fromSide],n2=normals[toSide];
  const c1={x:start.x+n1.x*distance,y:start.y+n1.y*distance},c2={x:end.x+n2.x*distance,y:end.y+n2.y*distance};
  const points=Array.from({length:25},(_,i)=>{const t=i/24,u=1-t;return{x:u**3*start.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t**3*end.x,y:u**3*start.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t**3*end.y}});
  return{start,end,c1,c2,points,path:`M${start.x} ${start.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`};
}
export function objectInArea(o,area,objects){
  if(o.type==='line'){const geometry=connectionGeometry(o,objects);return!!geometry&&geometry.points.slice(1).some((p,i)=>segmentInArea(geometry.points[i],p,area))}
  if(o.type==='pen'){const points=o.points.map(p=>({x:o.x+p[0]*o.w,y:o.y+p[1]*o.h}));return points.some(p=>contains(area,p))||points.slice(1).some((p,i)=>segmentInArea(points[i],p,area))}
  if(o.type==='frame')return contains(area,{x:o.x,y:o.y})&&contains(area,{x:o.x+o.w,y:o.y+o.h});
  return intersects(area,o);
}
export function selectionInArea(objects,area){return[...objects.values()].filter(o=>!elementLocked(objects,o.id)&&objectInArea(o,area,objects)).map(o=>o.id)}
export function deletionIds(objects,ids){const chosen=new Set(ids);for(const o of objects.values())if(o.type==='line'&&(chosen.has(o.from)||chosen.has(o.to)))chosen.add(o.id);return[...chosen]}
export function duplicateObjects(objects,ids,newId){
  const chosen=new Set(ids);for(const o of objects.values())if(o.type==='line'&&chosen.has(o.from)&&chosen.has(o.to))chosen.add(o.id);
  const counts=new Map();for(const id of chosen){const group=objects.get(id)?.groupId;if(group)counts.set(group,(counts.get(group)||0)+1)}
  const groups=new Map();for(const o of objects.values())if(chosen.has(o.id)&&o.groupId&&!groups.has(o.groupId))groups.set(o.groupId,newId());
  const mapping=new Map([...chosen].filter(id=>objects.has(id)).map(id=>[id,newId()]));
  return[...mapping].map(([oldId,id],index)=>{const o=structuredClone(objects.get(oldId));return{...o,id,locked:false,...(o.groupId?{groupId:counts.get(o.groupId)>1?groups.get(o.groupId):null}:{}),x:o.x+25,y:o.y+25,z:Date.now()+index,...(o.type==='line'?{from:mapping.get(o.from)||o.from,to:mapping.get(o.to)||o.to}:{})}});
}
