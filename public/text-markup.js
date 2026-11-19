const keys=['bold','italic','underline'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function textMarkError(o){
  if(o.textMarks===undefined)return null;
  if(!Array.isArray(o.textMarks)||o.textMarks.length>1000)return 'Formatação de trecho inválida.';
  let end=0;
  for(const mark of o.textMarks){
    if(!mark||typeof mark!=='object'||Array.isArray(mark)||Object.keys(mark).some(k=>!['from','to',...keys].includes(k))||!Number.isInteger(mark.from)||!Number.isInteger(mark.to)||mark.from<end||mark.from<0||mark.to<=mark.from||mark.to>String(o.text||'').length||!keys.some(k=>mark[k]!==undefined)||keys.some(k=>mark[k]!==undefined&&typeof mark[k]!=='boolean'))return 'Formatação de trecho inválida.';
    end=mark.to;
  }
  return null;
}
function runs(text,marks=[]){
  const boundaries=[...new Set([0,text.length,...marks.flatMap(m=>[m.from,m.to])])].filter(n=>n>=0&&n<=text.length).sort((a,b)=>a-b);
  return boundaries.slice(1).map((to,i)=>{const from=boundaries[i],mark=marks.find(m=>m.from<=from&&m.to>=to)||{};return{from,to,...Object.fromEntries(keys.filter(k=>typeof mark[k]==='boolean').map(k=>[k,mark[k]]))}});
}
function merge(marks){
  const result=[];
  for(const mark of marks){const style=Object.fromEntries(keys.filter(k=>typeof mark[k]==='boolean').map(k=>[k,mark[k]]));if(!Object.keys(style).length)continue;const last=result.at(-1);if(last&&last.to===mark.from&&keys.every(k=>last[k]===style[k]))last.to=mark.to;else result.push({from:mark.from,to:mark.to,...style})}
  return result;
}
export function rangeMarked(text,marks,from,to,key,base={}){if(!text.length)return!!base[key];return runs(text,marks).filter(r=>r.to>from&&r.from<to).every(r=>r[key]??!!base[key])}
export function toggleTextMark(text,marks,from,to,key,base={}){
  if(!keys.includes(key)||from>=to)return marks||[];
  const value=!rangeMarked(text,marks,from,to,key,base),split=r=>[r.from,Math.max(r.from,from),Math.min(r.to,to),r.to].filter((n,i,a)=>n>=r.from&&n<=r.to&&(!i||n!==a[i-1])).sort((a,b)=>a-b);
  return merge(runs(text,marks).flatMap(r=>{const points=[...new Set(split(r))];return points.slice(1).map((end,i)=>{const start=points[i],next={...r,from:start,to:end};if(start>=from&&end<=to){if(value===!!base[key])delete next[key];else next[key]=value}return next})}));
}
export function clearTextMark(marks,key){return merge((marks||[]).map(mark=>{const next={...mark};delete next[key];return next}))}
export function richTextHtml(o){
  const text=String(o.text||'');if(!o.textMarks?.length||textMarkError(o))return escape(text);
  return runs(text,o.textMarks).map(run=>{const style=[run.bold!==undefined?'font-weight:'+(run.bold?700:400):'',run.italic!==undefined?'font-style:'+(run.italic?'italic':'normal'):'',run.underline!==undefined?'text-decoration:'+(run.underline?'underline':'none'):''].filter(Boolean).join(';'),content=escape(text.slice(run.from,run.to));return style?'<span style="'+style+'">'+content+'</span>':content}).join('');
}

export function editableText(input,base){
  let text='',marks=[];
  function visit(node){
    if(node.nodeType===3){const from=text.length; text+=node.nodeValue||'';const style=input.ownerDocument.defaultView.getComputedStyle(node.parentElement),format={bold:Number(style.fontWeight)>=600||style.fontWeight==='bold',italic:style.fontStyle==='italic',underline:style.textDecorationLine.includes('underline')},patch=Object.fromEntries(keys.filter(k=>format[k]!==!!base[k]).map(k=>[k,format[k]]));if(text.length>from&&Object.keys(patch).length)marks.push({from,to:text.length,...patch});return}
    if(node.nodeType!==1||node.hasAttribute('data-editor-tail'))return;if(node.tagName==='BR'){text+='\n';return}
    if(node!==input&&['DIV','P'].includes(node.tagName)&&text&&!text.endsWith('\n'))text+='\n';
    for(const child of node.childNodes)visit(child);
  }
  visit(input);return{text,textMarks:merge(marks)};
}
export function editableSelection(input){
  const selection=input.ownerDocument.defaultView.getSelection();if(!selection?.rangeCount)return{from:0,to:0};const range=selection.getRangeAt(0);if(!input.contains(range.startContainer)||!input.contains(range.endContainer))return{from:0,to:0};
  const before=range.cloneRange();before.selectNodeContents(input);before.setEnd(range.startContainer,range.startOffset);const from=before.toString().length;return{from,to:from+range.toString().length};
}
export function selectEditable(input,from,to=from){
  const doc=input.ownerDocument,walker=doc.createTreeWalker(input,4);let node,offset=0,start=null,end=null;
  while((node=walker.nextNode())){const length=node.nodeValue.length;if(!start&&from<=offset+length)start=[node,Math.max(0,from-offset)];if(to<=offset+length){end=[node,Math.max(0,to-offset)];break}offset+=length}
  const range=doc.createRange();range.selectNodeContents(input);if(start&&end){range.setStart(...start);range.setEnd(...end)}else range.collapse(false);const selection=doc.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);
}
export function insertEditableText(input,text){
  const doc=input.ownerDocument,selection=doc.defaultView.getSelection();if(!selection.rangeCount)return;const range=selection.getRangeAt(0);if(!input.contains(range.commonAncestorContainer))return;range.deleteContents();const node=doc.createTextNode(text);range.insertNode(node);ensureEditableTail(input);range.setStart(node,node.length);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
}
export function ensureEditableTail(input){const needed=input.textContent.endsWith('\n'),tail=input.querySelector('[data-editor-tail]');if(needed&&!tail){const br=input.ownerDocument.createElement('br');br.setAttribute('data-editor-tail','');input.append(br)}else if(!needed)tail?.remove()}
export function renderEditable(input,o){input.innerHTML=richTextHtml(o);ensureEditableTail(input)}
