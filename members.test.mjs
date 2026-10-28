import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
const temp=await mkdtemp(path.join(tmpdir(),'miraaqui-members-')),port=14320,base='http://127.0.0.1:'+port;
let server;
function client(){let cookie='';return async(p,body,method=body?'POST':'GET')=>{const r=await fetch(base+'/api'+p,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json(),cookie}}}
const password='teste-seguro-123';
test('Gestão de membros protege permissões, revoga sessões, preserva conteúdo e mantém o último administrador',async()=>{
  try{
    const legacy=new DatabaseSync(path.join(temp,'elo.sqlite')),salt='fixture';legacy.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,hash TEXT NOT NULL,admin INTEGER DEFAULT 0)');legacy.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('a'.repeat(32),'admin@caaqui.com','Admin legado',salt+':'+scryptSync(password,salt,64).toString('hex'),1);legacy.close();
    server=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,DATABASE_URL:'',PORT:String(port),ELO_DATA_DIR:temp},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Servidor encerrou '+code)))});
    const admin=client(),person=client();assert.equal((await admin('/login',{email:'admin@caaqui.com',password})).status,200);assert.equal((await admin('/me')).data.user.role,'admin');
    const invite=(await admin('/invites',{})).data.token;const created=await person('/register',{name:'Colega',email:'colega@caaqui.com',password,invite});const memberId=created.data.user.id,adminId=(await admin('/me')).data.user.id;const board=(await person('/boards',{title:'Conteúdo do colega'})).data.id;
    assert.equal((await person('/members/'+adminId,{role:'admin'},'PATCH')).status,403);assert.equal((await person('/members/'+memberId+'/history')).status,403);
    assert.equal((await admin('/members/'+memberId,{role:'viewer'},'PATCH')).status,200);assert.equal((await person('/me')).status,401);
    assert.equal((await person('/login',{email:'colega@caaqui.com',password})).data.user.role,'viewer');assert.equal((await person('/boards/'+board)).status,200);
    for(const [route,body,method]of [['/boards',{title:'Não criar'},'POST'],['/boards/'+board,{title:'Não renomear'},'PATCH'],['/boards/'+board+'/objects',{changes:[]},'PATCH'],['/boards/'+board+'/comments',{text:'Não comentar'},'POST'],['/boards/'+board,null,'DELETE']])assert.equal((await person(route,body,method)).status,403);
    for(const change of [{email:'fora@example.test'},{name:''},{admin:1},{role:'owner'}])assert.equal((await admin('/members/'+memberId,change,'PATCH')).status,400);
    assert.equal((await admin('/members/'+memberId,{email:'admin@caaqui.com'},'PATCH')).status,409);
    assert.equal((await admin('/members/'+memberId,{name:'Colega atualizado',email:'novo@caaqui.com',role:'editor'},'PATCH')).status,200);assert.equal((await person('/me')).status,401);assert.equal((await person('/login',{email:'colega@caaqui.com',password})).status,401);assert.equal((await person('/login',{email:'novo@caaqui.com',password})).status,200);
    const cookie=(await person('/me')).cookie,controller=new AbortController(),stream=await fetch(base+'/api/boards/'+board+'/events',{headers:{Cookie:cookie},signal:controller.signal}),reader=stream.body.getReader();await reader.read();
    assert.equal((await admin('/members/'+memberId,{status:'suspended'},'PATCH')).status,200);
    let events='';const timeout=setTimeout(()=>controller.abort(),7000);try{for(let i=0;i<10&&!events.includes('access-revoked');i++){const chunk=await reader.read();if(chunk.done)break;events+=new TextDecoder().decode(chunk.value)}}finally{clearTimeout(timeout);controller.abort()};assert.match(events,/access-revoked/);
    assert.equal((await person('/me')).status,401);assert.equal((await person('/login',{email:'novo@caaqui.com',password})).status,403);
    assert.equal((await admin('/members/'+memberId,{status:'active'},'PATCH')).status,200);assert.equal((await person('/me')).status,401);assert.equal((await person('/login',{email:'novo@caaqui.com',password})).status,200);
    assert.equal((await admin('/members/'+memberId,null,'DELETE')).status,200);assert.equal((await person('/me')).status,401);assert.equal((await person('/login',{email:'novo@caaqui.com',password})).status,403);assert.equal((await admin('/boards/'+board)).status,200);assert.equal((await admin('/members')).data.find(u=>u.id===memberId).status,'removed');
    assert.equal((await admin('/members/'+adminId,null,'DELETE')).status,409);assert.equal((await admin('/members/'+adminId,{role:'viewer'},'PATCH')).status,409);assert.equal((await admin('/me')).status,200);
    assert.equal((await admin('/members/'+memberId,{status:'active',role:'admin'},'PATCH')).status,200);assert.equal((await person('/login',{email:'novo@caaqui.com',password})).status,200);
    const demotions=await Promise.all([admin('/members/'+adminId,{role:'editor'},'PATCH'),person('/members/'+memberId,{role:'editor'},'PATCH')]);assert.deepEqual(demotions.map(r=>r.status).sort(),[200,409]);const remaining=demotions[0].status===409?admin:person;
    assert.equal((await remaining('/members')).data.filter(u=>u.admin&&u.status==='active').length,1);const history=(await remaining('/members/'+memberId+'/history')).data;assert.ok(history.length>=5);assert.ok(!JSON.stringify(history).includes('hash'));
  }finally{if(server)await new Promise(resolve=>{server.once('exit',resolve);server.kill()});await rm(temp,{recursive:true,force:true})}
});
