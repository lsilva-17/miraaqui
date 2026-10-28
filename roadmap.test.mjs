import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newRoadmap,roadmapLayout,roadmapError,dayNumber,roadmapHtml,roadmapSvg,ROADMAP_VIEWS} from './public/roadmap.js';
const value={view:'month',tasks:[{id:'a',title:'Atividade',start:'2028-02-28',end:'2028-03-01',progress:40}]};
test('Calendário respeita seis granularidades, semanas e quinzenas reais',()=>{
  const object=newRoadmap('roadmap',new Date(2026,9,28));assert.equal(roadmapError(object.roadmap),null);
  for(const [view] of ROADMAP_VIEWS){const layout=roadmapLayout({...value,view});assert.ok(layout.start<=dayNumber(value.tasks[0].start));assert.ok(layout.end>dayNumber(value.tasks[0].end));assert.ok(layout.periods.every((p,i)=>p.start<p.end&&(!i||p.start===layout.periods[i-1].end)));assert.ok(layout.bars[0].width>0)}
  const week=roadmapLayout({...value,view:'week'});assert.equal(new Date(week.start*86400000).getUTCDay(),1);
  const fortnight=roadmapLayout({...value,view:'fortnight'});assert.equal(new Date(fortnight.start*86400000).getUTCDate(),16);assert.equal(fortnight.periods[0].end-fortnight.periods[0].start,14);
});
test('Barra usa início e fim inclusivos, inclusive dias únicos e anos bissextos',()=>{
  const layout=roadmapLayout(value);assert.equal(layout.end-layout.start,60);assert.equal(layout.bars[0].width,5);assert.equal(layout.bars[0].left,27/60*100);
  const single=roadmapLayout({view:'year',tasks:[{...value.tasks[0],start:'2028-02-29',end:'2028-02-29'}]});assert.equal(single.bars[0].width,100/366);
  assert.ok(Number.isNaN(dayNumber('2027-02-29')));assert.ok(Number.isNaN(dayNumber('2028-02-30')));
});
test('Roadmap valida datas, conclusão, limites e identificadores e escapa conteúdo',()=>{
  for(const patch of [{start:'2028-04-01'}, {end:'2028-02-27'}, {progress:101}, {progress:-1}, {progress:NaN}, {title:''}, {id:'a"onclick'}])assert.ok(roadmapError({...value,tasks:[{...value.tasks[0],...patch}]}));
  assert.ok(roadmapError({...value,view:'day'}));assert.ok(roadmapError({...value,tasks:[value.tasks[0],value.tasks[0]]}));assert.ok(roadmapError({...value,tasks:Array.from({length:101},(_,i)=>({...value.tasks[0],id:String(i)}))}));assert.ok(roadmapError({...value,tasks:[{...value.tasks[0],start:'2000-01-01',end:'2026-01-01'}]}));
  const object=newRoadmap('roadmap',new Date(2026,9,28));object.text='<script>alert(1)</script>';object.roadmap.tasks[0].title='<img onerror=evil>';
  const html=roadmapHtml(object,true);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img'));assert.ok(html.includes('disabled'));assert.match(roadmapSvg(object),/&lt;img/);
  assert.equal(roadmapError({view:'year',tasks:[]}),null);assert.equal(roadmapLayout({view:'year',tasks:[]}).bars.length,0);
});
