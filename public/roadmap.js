export const ROADMAP_VIEWS=[['week','Semana'],['fortnight','Quinzena'],['month','Mês'],['quarter','Trimestre'],['semester','Semestre'],['year','Ano']];
export const TASK_STATUSES=[['not_started','Não iniciado'],['in_progress','Em andamento'],['done','Concluído']];
export function taskStatus(task){return task.status??(task.progress===100?'done':task.progress>0?'in_progress':'not_started')}
export function taskCondition(task,today){return taskStatus(task)==='done'?'done':dayNumber(task.end)<dayNumber(today)?'overdue':taskStatus(task)==='in_progress'?'in_progress':'not_started'}
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
    if(task.status!==undefined&&!TASK_STATUSES.some(([status])=>status===task.status)||task.status===undefined&&task.progress===undefined)return 'Escolha um status válido para a atividade.';
    if(task.progress!==undefined&&(!Number.isFinite(task.progress)||task.progress<0||task.progress>100))return 'A conclusão deve ficar entre 0% e 100%.';
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
export function roadmapLayout(value,today=new Date().toLocaleDateString('sv-SE')){
  const days=value.tasks.flatMap(task=>[dayNumber(task.start),dayNumber(task.end)]),fallback=dayNumber(today);
  if(!days.length||Math.max(...days,fallback)-Math.min(...days,fallback)<=3660)days.push(fallback);
  const start=boundary(Math.min(...days),value.view),last=Math.max(...days),periods=[];
  let end=start;
  do{const next=nextPeriod(end,value.view);periods.push({start:end,end:next,...periodLabel(end,next,value.view)});end=next}while(end<=last&&periods.length<530);
  const duration=end-start;
  return {start,end,periods,today, todayPosition:Math.max(0,Math.min(100,(fallback+.5-start)/duration*100)),todayOutside:fallback<start?'before':fallback>=end?'after':null,minWidth:Math.max(760,periods.length*({week:100,fortnight:120,month:130,quarter:150,semester:170,year:190}[value.view])),bars:value.tasks.map(task=>({id:task.id,left:(dayNumber(task.start)-start)/duration*100,width:(dayNumber(task.end)+1-dayNumber(task.start))/duration*100})),height:Math.max(290,Math.min(780,202+value.tasks.length*90))};
}
export function newRoadmap(id,today=new Date()){
  const start=Date.UTC(today.getFullYear(),today.getMonth(),1)/DAY;
  return {id,type:'roadmap',x:70,y:80,w:1320,h:652,text:'Roadmap da equipe',color:'#ffffff',z:Date.now(),roadmap:{view:'month',tasks:[['Alinhar objetivo e escopo',0,10,'done'],['Explorar e priorizar',7,25,'in_progress'],['Construir a solução',20,55,'in_progress'],['Validar com usuários',48,69,'not_started'],['Publicar e acompanhar',63,85,'not_started']].map(([title,from,to,status],i)=>({id:id+'-task-'+i,title,start:isoDay(start+from),end:isoDay(start+to),status}))}};
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roadmapHtml(object,disabled=false){
  const value=object.roadmap,layout=roadmapLayout(value),duration=layout.end-layout.start,disable=disabled?'disabled':'';
  const header=layout.periods.map(period=>'<div class="roadmap-period" style="width:'+((period.end-period.start)/duration*100)+'%"><strong>'+escape(period.label)+'</strong><small>'+escape(period.detail)+'</small></div>').join('');
  const marker='<span class="roadmap-today-label" style="left:'+layout.todayPosition+'%" title="'+layout.today+(layout.todayOutside?' · fora do período exibido':'')+'">Hoje · '+shortDay(dayNumber(layout.today))+'</span>';
  return '<div class="roadmap-content"><div class="roadmap-toolbar"><div><small>PLANEJAMENTO DA EQUIPE</small><h3>'+escape(object.text||'Roadmap')+'</h3></div><label>Visualização<select data-roadmap-view="'+escape(object.id)+'" '+disable+'>'+ROADMAP_VIEWS.map(([key,label])=>'<option value="'+key+'" '+(value.view===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label><button class="outline" data-edit-roadmap="'+escape(object.id)+'" '+disable+'>Editar atividades</button></div><div class="roadmap-scroll" data-roadmap-scroll><div class="roadmap-table" style="min-width:'+(layout.minWidth+320)+'px"><div class="roadmap-table-head"><div class="roadmap-task-heading">Atividades <span>'+value.tasks.length+'</span></div><div class="roadmap-calendar">'+header+marker+'</div></div>'+value.tasks.map((task,i)=>{const bar=layout.bars[i],status=taskStatus(task),condition=taskCondition(task,layout.today),label=TASK_STATUSES.find(([key])=>key===status)?.[1]||'';return '<div class="roadmap-row"><form class="roadmap-task-name" data-inline-roadmap="'+escape(object.id)+'" data-inline-task="'+escape(task.id)+'"><div class="roadmap-inline-title"><input aria-label="Nome da atividade '+(i+1)+'" data-inline-title maxlength="160" required value="'+escape(task.title)+'" '+disable+'><button aria-label="Salvar atividade '+(i+1)+'" title="Salvar atividade" '+disable+'>✓</button></div><div class="roadmap-inline-dates"><input aria-label="Início da atividade '+(i+1)+'" data-inline-start type="date" required min="1900-01-01" max="2200-12-31" value="'+task.start+'" '+disable+'><span>→</span><input aria-label="Fim da atividade '+(i+1)+'" data-inline-end type="date" required min="1900-01-01" max="2200-12-31" value="'+task.end+'" '+disable+'></div><select aria-label="Status da atividade '+(i+1)+'" data-inline-status '+disable+'>'+TASK_STATUSES.map(([key,name])=>'<option value="'+key+'" '+(key===status?'selected':'')+'>'+name+'</option>').join('')+'</select></form><div class="roadmap-track">'+layout.periods.map(period=>'<span class="roadmap-gridline" style="left:'+((period.start-layout.start)/duration*100)+'%"></span>').join('')+'<div class="roadmap-bar status-'+condition+'" style="left:'+bar.left+'%;width:'+bar.width+'%" title="'+escape(task.title)+' · '+task.start+' a '+task.end+' · '+label+'"><span class="roadmap-bar-label">'+label+'</span></div><span class="roadmap-today-line status-'+condition+'" style="left:'+layout.todayPosition+'%" title="Hoje · '+layout.today+'"></span></div></div>'}).join('')+(value.tasks.length?'':'<p class="roadmap-empty">Adicione a primeira atividade em “Editar atividades”.</p>')+'</div></div><div class="roadmap-footer"><span class="roadmap-key pending"></span> Não iniciado <span class="roadmap-key active"></span> Em andamento <span class="roadmap-key done"></span> Concluído <span class="roadmap-key overdue"></span> Prazo vencido · Linha vertical: hoje</div></div>';
}
export function roadmapSvg(object){
  const layout=roadmapLayout(object.roadmap),left=280,width=object.w-left,rowHeight=Math.min(70,(object.h-128)/Math.max(1,object.roadmap.tasks.length)),duration=layout.end-layout.start,colors={done:'#9ececc',overdue:'#f6c7c5',in_progress:'#b9d7fa',not_started:'#e5e2dd'},strokes={done:'#369474',overdue:'#dc9693',in_progress:'#528ed3',not_started:'#a69b90'};
  return '<g transform="translate('+object.x+' '+object.y+')"><rect width="'+object.w+'" height="'+object.h+'" rx="12" fill="white" stroke="#dedbd7"/><text x="20" y="34" font-size="22" fill="#1e131e">'+escape(object.text||'Roadmap')+'</text>'+layout.periods.map(p=>{const x=left+(p.start-layout.start)/duration*width;return '<line x1="'+x+'" y1="58" x2="'+x+'" y2="'+object.h+'" stroke="#e7e4df"/><text x="'+(x+5)+'" y="75" font-size="10">'+escape(p.label+' '+p.detail)+'</text>'}).join('')+object.roadmap.tasks.map((task,i)=>{const bar=layout.bars[i],y=100+i*rowHeight,x=left+bar.left/100*width,w=bar.width/100*width,condition=taskCondition(task,layout.today),marker=left+layout.todayPosition/100*width;return '<text x="20" y="'+(y+15)+'" font-size="13">'+escape(task.title.slice(0,28))+'</text><text x="20" y="'+(y+33)+'" font-size="10">'+escape(TASK_STATUSES.find(([key])=>key===taskStatus(task))[1])+'</text><rect x="'+x+'" y="'+y+'" width="'+w+'" height="28" rx="5" fill="'+colors[condition]+'"/><line x1="'+marker+'" x2="'+marker+'" y1="'+y+'" y2="'+(y+rowHeight)+'" stroke="'+strokes[condition]+'" stroke-width="2"/>'}).join('')+'</g>';
}
