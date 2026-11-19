import {altDragCopies,duplicateObjects} from './public/canvas-geometry.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toggleTextMark,richTextHtml,textMarkError,rangeMarked} from './public/text-markup.js';
import {formatChanges,propertyError} from './public/element-properties.js';

test('Negrito de trecho afeta apenas o intervalo selecionado e pode ser removido',()=>{
  const text='Discovery técnico e negócios',marks=toggleTextMark(text,[],0,9,'bold',{bold:false});
  assert.deepEqual(marks,[{from:0,to:9,bold:true}]);assert.equal(richTextHtml({text,textMarks:marks}),'<span style="font-weight:700">Discovery</span> técnico e negócios');
  assert.deepEqual(toggleTextMark(text,marks,0,9,'bold',{bold:false}),[]);
  assert.deepEqual(toggleTextMark(text,[],10,17,'bold',{bold:true}),[{from:10,to:17,bold:false}]);
});
test('Intervalos sobrepostos preservam palavras vizinhas e outros estilos',()=>{
  const text='abcdefghij',first=toggleTextMark(text,[],2,6,'bold',{}),second=toggleTextMark(text,first,4,8,'italic',{}),third=toggleTextMark(text,second,3,5,'bold',{});
  assert.equal(rangeMarked(text,third,2,3,'bold',{}),true);assert.equal(rangeMarked(text,third,3,5,'bold',{}),false);assert.equal(rangeMarked(text,third,5,6,'bold',{}),true);assert.equal(rangeMarked(text,third,4,8,'italic',{}),true);assert.equal(textMarkError({text,textMarks:third}),null);
});
test('Formatação respeita offsets UTF-16, novas linhas e escapa HTML',()=>{
  const text='Olá 👋\n<script>alert(1)</script>',from=text.indexOf('<script>'),marks=toggleTextMark(text,[],from,text.length,'bold',{}),html=richTextHtml({text,textMarks:marks});
  assert.match(html,/Olá 👋\n<span style="font-weight:700">&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.equal(propertyError({type:'sticky',text,textMarks:marks}),null);
});
test('Servidor rejeita HTML, posições inválidas e excesso de marcas',()=>{
  for(const textMarks of [[{from:0,to:2,bold:'yes'}],[{from:-1,to:2,bold:true}],[{from:0,to:99,bold:true}],[{from:0,to:2,onclick:'bad'}],[{from:0,to:3,bold:true},{from:2,to:4,bold:false}],Array(1001).fill({from:0,to:1,bold:true})])assert.ok(propertyError({type:'sticky',text:'texto',textMarks}));
});
test('Negrito do componente inteiro substitui o estilo do trecho e mantém outros formatos',()=>{
  const object={id:'one',type:'sticky',text:'texto',textMarks:[{from:0,to:2,bold:true,italic:true}]},[change]=formatChanges(new Map([['one',object]]),['one'],{bold:false});
  assert.deepEqual(change.object.textMarks,[{from:0,to:2,italic:true}]);assert.equal(change.object.textStyle.bold,false);assert.equal(rangeMarked('',[],0,0,'bold',{bold:false}),false);
});

test('Duplicar mantém trechos; Alt arraste de nota vazia remove marcas antigas',()=>{
 const source={id:'source',type:'sticky',x:0,y:0,w:180,h:160,color:'#ffffff',text:'Texto',textMarks:[{from:0,to:5,bold:true}]},objects=new Map([[source.id,source]]),[copy]=duplicateObjects(objects,['source'],()=> 'copy');assert.deepEqual(copy.textMarks,source.textMarks);const [empty]=altDragCopies(objects,['source'],()=> 'empty');assert.equal(empty.text,'');assert.equal(empty.textMarks,undefined);assert.equal(propertyError(empty),null);
});
