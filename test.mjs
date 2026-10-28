import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {allowedEmail} from './lib/access-policy.mjs';
const temp=await mkdtemp(path.join(tmpdir(),'elo-test-')),port=14319,base='http://127.0.0.1:'+port;
let server;
async function start(){server=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:String(port),ELO_DATA_DIR:temp},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.on('data',()=>resolve());server.on('error',reject);server.on('exit',c=>reject(new Error('Server exited '+c)))})}
async function stop(){if(!server)return;await new Promise(resolve=>{server.once('exit',resolve);server.kill()});server=null}
function client(){let cookie='';return async(p,body,method=body?'POST':'GET',extra={})=>{const r=await fetch(base+'/api'+p,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...extra},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const d=await r.json();return {status:r.status,data:d,cookie}}}
test('Domínio corporativo aceita maiúsculas e rejeita domínios parecidos',()=>{
for(const email of ['nome@caaqui.com','NOME@CAAQUI.COM','  nome@caaqui.com  '])assert.equal(allowedEmail(email),true);
for(const email of ['nome@gmail.com','nome@sub.caaqui.com','nome@caaqui.com.evil.test','nome@caaquiXcom','nome@caaqui.com@evil.test','nome@caaquı.com','@caaqui.com','nome com espaço@caaqui.com','nome@caaqui.com\nextra',null])assert.equal(allowedEmail(email),false);
});

test('Contas, convites, autorização, colaboração e persistência',async()=>{try{await start();const owner=client(),member=client(),guest=client();assert.equal((await guest('/boards')).status,401);assert.equal((await owner('/status')).data.setup,true);
assert.equal((await owner('/setup',{name:'Admin teste',email:'admin@caaqui.com',password:'teste-seguro-123',org:'Companhia de teste'})).status,200);
assert.equal((await guest('/setup',{name:'Outro',email:'x@caaqui.com',password:'teste-seguro-123',org:'Outro'})).status,409);
assert.equal((await guest('/register',{name:'Visitante',email:'bad@caaqui.com',password:'teste-seguro-123',invite:'incorreto'})).status,403);
const invite=(await owner('/invites',{})).data.token;
for(const email of ['outside@gmail.com','outside@sub.caaqui.com','outside@caaqui.com.evil.test']){
const blocked=await guest('/register',{name:'Fora do domínio',email,password:'teste-seguro-123',invite});assert.equal(blocked.status,403);assert.match(blocked.data.error,/@caaqui\.com/);
}
// Legacy accounts and their valid sessions must also lose access, even if admin.
const oldToken='legacy-test-token',fixture=new DatabaseSync(path.join(temp,'elo.sqlite'));
fixture.prepare('INSERT INTO users(id,email,name,hash,admin) SELECT ?,?,?,hash,1 FROM users WHERE email=?').run('legacy-external','legacy@example.test','Legado','admin@caaqui.com');
fixture.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(oldToken).digest('hex'),'legacy-external',Date.now()+3600000);fixture.close();
assert.equal((await guest('/login',{email:'legacy@example.test',password:'teste-seguro-123'})).status,403);
for(const route of ['/me','/boards','/invites'])assert.equal((await fetch(base+'/api'+route,{method:route==='/invites'?'POST':'GET',headers:{Cookie:'elo='+oldToken}})).status,401);
assert.equal((await client()('/login',{email:' ADMIN@CAAQUI.COM ',password:'teste-seguro-123'})).status,200);
assert.equal((await member('/register',{name:'Colega teste',email:'colega@caaqui.com',password:'teste-seguro-123',invite})).status,200);
assert.equal((await guest('/register',{name:'Intruso',email:'intruso@caaqui.com',password:'teste-seguro-123',invite})).status,403);assert.equal((await member('/invites',{})).status,403);
const board=(await owner('/boards',{title:'Quadro de teste'})).data.id;assert.equal((await member('/boards')).data.length,1);assert.equal((await member('/boards/'+board,null,'DELETE')).status,403);
assert.equal((await fetch(base+'/api/boards/'+board+'/events',{headers:{Cookie:'elo='+oldToken}})).status,401);
const controller=new AbortController(),cookie=(await member('/me')).cookie,stream=await fetch(base+'/api/boards/'+board+'/events',{headers:{Cookie:cookie},signal:controller.signal}),reader=stream.body.getReader();assert.equal(stream.status,200);await reader.read();
const sticky={id:'nota-a',type:'sticky',x:40,y:60,w:180,h:160,text:'Ideia compartilhada',color:'#fff0a9'};assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:sticky}],client:'admin'},'PATCH')).status,200);
let event='';for(let i=0;i<5&&!event.includes('Ideia compartilhada');i++){const chunk=await reader.read();event+=new TextDecoder().decode(chunk.value)}assert.match(event,/Ideia compartilhada/);controller.abort();
assert.equal((await member('/boards/'+board)).data.objects[0].text,'Ideia compartilhada');const second={...sticky,id:'nota-b',text:'Ideia do colega'};await member('/boards/'+board+'/objects',{changes:[{id:second.id,object:second}]},'PATCH');assert.equal((await owner('/boards/'+board)).data.objects.length,2);
assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:'bad',object:{...sticky,id:'bad',x:'invalid'}}]},'PATCH')).status,400);
const free={id:'free-arrow',type:'line',free:true,x:20,y:30,w:150,h:80,points:[[0,0],[1,1]],color:'#839477'};assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:free.id,object:free}]},'PATCH')).status,200);assert.equal((await member('/boards/'+board)).data.objects.find(o=>o.id===free.id).free,true);assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:'bad-free',object:{...free,id:'bad-free',points:[[0,0],[99,1]]}}]},'PATCH')).status,400);await owner('/boards/'+board+'/objects',{changes:[{id:free.id,object:null}]},'PATCH');
const formatted={...sticky,groupId:'group-test',textStyle:{fontFamily:'Georgia',fontSize:28,bold:true,color:'#045077',align:'center'}};
assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:formatted}]},'PATCH')).status,200);
assert.equal((await member('/boards/'+board)).data.objects.find(o=>o.id===sticky.id).textStyle.fontSize,28);
for(const bad of [{textStyle:{fontFamily:'evil;display:none'}},{textStyle:{fontSize:999}},{locked:'yes'},{groupId:'bad group'}])assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:{...formatted,...bad}}]},'PATCH')).status,400);
const locked={...formatted,locked:true};assert.equal((await owner('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:locked}]},'PATCH')).status,200);
assert.equal((await member('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:{...locked,x:999}}]},'PATCH')).status,409);
assert.equal((await member('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:{...locked,locked:false,text:'Tentativa de alterar e desbloquear'}}]},'PATCH')).status,409);
assert.equal((await member('/boards/'+board+'/objects',{changes:[{id:second.id,object:{...second,text:'Não deve salvar'}},{id:sticky.id,object:null}]},'PATCH')).status,409);
assert.equal((await owner('/boards/'+board)).data.objects.find(o=>o.id===second.id).text,second.text);
assert.equal((await member('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:{...locked,locked:false}}]},'PATCH')).status,200);
assert.equal((await member('/boards/'+board+'/objects',{changes:[{id:sticky.id,object:{...formatted,x:80}}]},'PATCH')).status,200);
assert.equal((await owner('/boards',{title:'Ataque'},'POST',{Origin:'http://outro.test'})).status,403);
assert.equal((await member('/boards/'+board+'/comments',{text:'Vamos testar esta ideia.'})).status,200);assert.equal((await owner('/boards/'+board)).data.comments.length,1);
await stop();await start();assert.equal((await owner('/boards/'+board)).data.objects.find(o=>o.id===sticky.id).textStyle.fontSize,28);assert.equal((await owner('/boards/'+board)).data.objects.length,2);assert.equal((await owner('/boards/'+board)).data.comments.length,1);
await member('/logout',{});assert.equal((await member('/boards')).status,401);assert.equal((await owner('/boards/'+board,null,'DELETE')).status,200);assert.equal((await owner('/boards/'+board)).status,404);
}finally{await stop();await rm(temp,{recursive:true,force:true})}});
