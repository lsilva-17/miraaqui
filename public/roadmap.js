export const ROADMAP_VIEWS=[['week','Semana'],['fortnight','Quinzena'],['month','Mês'],['quarter','Trimestre'],['semester','Semestre'],['year','Ano']];
const DAY=86400000;
const date=value=>new Date(value*DAY);
export const isoDay=value=>date(value).toISOString().slice(0,10);
export function dayNumber(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
  const day=Date.parse(value+'T00:00:00Z')/DAY;
  return Number.isFinite(day)&&isoDay(day)===value&&value>='1900-01-01'&&value<='2200-12-31'?day:NaN;
}
export function roadmapError(value){
  if(!value||!ROADMAP_VIEWS.some(([view])=>view===value.view)||!Array.isArray(value.tasks)||value.tasks.length>100)return 'Roadmap inválido. Use até 100 atividades.';
  const ids=new Set(),days=[];
  for(const task of value.tasks){
    if(!task||typeof task.id!=='string'||! /^[\w-]{1,100}$/.test(task.id)||ids.has(task.id))return 'Identificador de atividade inválido.';
    ids.add(task.id);
    if(typeof task.title!=='string'||!task.title.trim()||task.title.length>160)return 'Preencha o nome de cada atividade (até 160 caracteres).';
    const start=dayNumber(task.start),end=dayNumber(task.end);
    if(!Number.isFinite(start)||!Number.isFinite(end))return 'Preencha datas válidas entre 1900 e 2200.';
    if(end<start)return 'A data de fim deve ser igual ou posterior à data de início.';
    if(!Number.isFinite(task.progress)||task.progress<0||task.progress>100)return 'A conclusão deve ficar entre 0% e 100%.';
    days.push(start,end);
  }
  if(days.length&&Math.max(...days)-Math.min(...days)>3660)return 'Mantenha o intervalo do roadmap em até 10 anos.';
  return null;
}
function boundary(day,view){
  const d=date(day),year=d.getUTCFullYear(),month=d.getUTCMonth();
  if(view==='week')return day-(d.getUTCDay()+6)%7;
  if(view==='fortnight')return Date.UTC(year,month,d.getUTCDate()<=15?1:16)/DAY;
  const step={month:1,quarter:3,semester:6,year:12}[view];
  return Date.UTC(year,Math.floor(month/step)*step,1)/DAY;
}
function nextPeriod(day,view){
  if(view==='week')return day+7;
  const d=date(day),year=d.getUTCFullYear(),month=d.getUTCMonth();
  if(view==='fortnight')return Date.UTC(year,month+(d.getUTCDate()===16?1:0),d.getUTCDate()===1?16:1)/DAY;
  return Date.UTC(year,month+({month:1,quarter:3,semester:6,year:12}[view]),1)/DAY;
}
const shortDay=day=>date(day).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'UTC'});
function periodLabel(start,end,view){
  const d=date(start),year=d.getUTCFullYear(),month=d.getUTCMonth();
  const label=view==='week'?shortDay(start)+'–'+shortDay(end-1):view==='fortnight'?(d.getUTCDate()===1?'1ª':'2ª')+' quinzena':view==='quarter'?(Math.floor(month/3)+1)+'º trimestre':view==='semester'?(Math.floor(month/6)+1)+'º semestre':view==='year'?String(year):d.toLocaleDateString('pt-BR',{month:'long',timeZone:'UTC'});
  const detail=['week','year'].includes(view)?String(year):view==='fortnight'?d.toLocaleDateString('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}):String(year);
  return {label,detail};
}
export function roadmapLayout(value,today=new Date().toISOString().slice(0,10)){
  const days=value.tasks.flatMap(task=>[dayNumber(task.start),dayNumber(task.end)]),fallback=dayNumber(today);
  const start=boundary(days.length?Math.min(...days):fallback,value.view),last=days.length?Math.max(...days):fallback,periods=[];
  let end=start;
  do{const next=nextPeriod(end,value.view);periods.push({start:end,end:next,...periodLabel(end,next,value.view)});end=next}while(end<=last&&periods.length<530);
  const duration=end-start;
  return {start,end,periods,minWidth:Math.max(760,periods.length*({week:100,fortnight:120,month:130,quarter:150,semester:170,year:190}[value.view])),bars:value.tasks.map(task=>({id:task.id,left:(dayNumber(task.start)-start)/duration*100,width:(dayNumber(task.end)+1-dayNumber(task.start))/duration*100})),height:Math.max(290,Math.min(780,202+value.tasks.length*58))};
}
export function newRoadmap(id,today=new Date()){
  const start=Date.UTC(today.getFullYear(),today.getMonth(),1)/DAY;
  return {id,type:'roadmap',x:70,y:80,w:1320,h:492,text:'Roadmap da equipe',color:'#ffffff',z:Date.now(),roadmap:{view:'month',tasks:[['Alinhar objetivo e escopo',0,10,100],['Explorar e priorizar',7,25,60],['Construir a solução',20,55,25],['Validar com usuários',48,69,0],['Publicar e acompanhar',63,85,0]].map(([title,from,to,progress],i)=>({id:id+'-task-'+i,title,start:isoDay(start+from),end:isoDay(start+to),progress}))}};
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roadmapHtml(object,disabled=false){
  const value=object.roadmap,layout=roadmapLayout(value),duration=layout.end-layout.start;
  const header=layout.periods.map(period=>'<div class="roadmap-period" style="width:'+((period.end-period.start)/duration*100)+'%"><strong>'+escape(period.label)+'</strong><small>'+escape(period.detail)+'</small></div>').join('');
  return '<div class="roadmap-content"><div class="roadmap-toolbar"><div><small>PLANEJAMENTO DA EQUIPE</small><h3>'+escape(object.text||'Roadmap')+'</h3></div><label>Visualização<select data-roadmap-view="'+escape(object.id)+'" '+(disabled?'disabled':'')+'>'+ROADMAP_VIEWS.map(([key,label])=>'<option value="'+key+'" '+(value.view===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label><button class="outline" data-edit-roadmap="'+escape(object.id)+'" '+(disabled?'disabled':'')+'>Editar atividades</button></div><div class="roadmap-scroll" data-roadmap-scroll><div class="roadmap-table" style="min-width:'+(layout.minWidth+260)+'px"><div class="roadmap-table-head"><div class="roadmap-task-heading">Atividades <span>'+value.tasks.length+'</span></div><div class="roadmap-calendar">'+header+'</div></div>'+value.tasks.map((task,i)=>{const bar=layout.bars[i];return '<div class="roadmap-row"><div class="roadmap-task-name"><strong>'+escape(task.title)+'</strong><small>'+shortDay(dayNumber(task.start))+' → '+shortDay(dayNumber(task.end))+' · '+task.progress+'% concluído</small></div><div class="roadmap-track">'+layout.periods.map(period=>'<span class="roadmap-gridline" style="left:'+((period.start-layout.start)/duration*100)+'%"></span>').join('')+'<div class="roadmap-bar '+(task.progress===100?'complete':'')+'" style="left:'+bar.left+'%;width:'+bar.width+'%" title="'+escape(task.title)+' · '+task.start+' a '+task.end+' · '+task.progress+'%"><span class="roadmap-progress" style="width:'+task.progress+'%"></span><span class="roadmap-bar-label">'+task.progress+'%</span></div></div></div>'}).join('')+(value.tasks.length?'':'<p class="roadmap-empty">Adicione a primeira atividade em “Editar atividades”.</p>')+'</div></div><div class="roadmap-footer"><span class="roadmap-key"></span> Período planejado <span class="roadmap-key progress"></span> Percentual concluído · Datas inclusivas</div></div>';
}
export function roadmapSvg(object){
  const layout=roadmapLayout(object.roadmap),left=260,width=object.w-left,rowHeight=Math.min(58,(object.h-128)/Math.max(1,object.roadmap.tasks.length)),duration=layout.end-layout.start;
  return '<g transform="translate('+object.x+' '+object.y+')"><rect width="'+object.w+'" height="'+object.h+'" rx="12" fill="white" stroke="#dedbd7"/><text x="20" y="34" font-size="22" fill="#1e131e">'+escape(object.text||'Roadmap')+'</text>'+layout.periods.map(p=>{const x=left+(p.start-layout.start)/duration*width;return '<line x1="'+x+'" y1="58" x2="'+x+'" y2="'+object.h+'" stroke="#e7e4df"/><text x="'+(x+5)+'" y="75" font-size="10">'+escape(p.label+' '+p.detail)+'</text>'}).join('')+object.roadmap.tasks.map((task,i)=>{const bar=layout.bars[i],y=100+i*rowHeight,x=left+bar.left/100*width,w=bar.width/100*width;return '<text x="20" y="'+(y+15)+'" font-size="13">'+escape(task.title.slice(0,28))+'</text><rect x="'+x+'" y="'+y+'" width="'+w+'" height="24" rx="5" fill="#ffe0c8"/><rect x="'+x+'" y="'+y+'" width="'+w*task.progress/100+'" height="24" rx="5" fill="#f0612d"/><text x="'+(x+5)+'" y="'+(y+16)+'" font-size="11">'+task.progress+'%</text>'}).join('')+'</g>';
}
