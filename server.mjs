import http from 'node:http';
import {randomBytes,scrypt as rawScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {database} from './lib/database.mjs';
const scrypt=promisify(rawScrypt),root=path.dirname(fileURLToPath(import.meta.url));
const id=()=>randomBytes(16).toString('hex'),digest=s=>createHash('sha256').update(s).digest('hex');
const safeUser=u=>({id:u.id,email:u.email,name:u.name,admin:!!u.admin});
const secure=()=>process.env.VERCEL||process.env.ELO_SECURE_COOKIE==='1';
function status(code,message){throw Object.assign(new Error(message),{status:code})}
function text(v,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)status(400,'Preencha os campos corretamente.');return v.trim()}
async function body(req){if(req.body&&typeof req.body==='object')return req.body;let input='';for await(const chunk of req){input+=chunk;if(input.length>4_300_000)status(413,'Arquivo muito grande.')}try{return JSON.parse(input||'{}')}catch{status(400,'Dados inválidos.')}}
async function hashPassword(v){if(typeof v!=='string'||v.length<10||v.length>200)status(400,'Use uma senha de 10 a 200 caracteres.');const salt=id();return salt+':'+(await scrypt(v,salt,64)).toString('hex')}
function tokenFrom(req){return(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('elo='))?.slice(4)}
async function auth(db,req){const token=tokenFrom(req);if(!token)return null;return db.one('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?',[digest(token),Date.now()])}
async function session(db,res,user){const token=id()+id();await db.query('INSERT INTO sessions VALUES(?,?,?)',[digest(token),user.id,Date.now()+7*86400000]);res.setHeader('Set-Cookie',`elo=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure()?'; Secure':''}`)}
const eventStatement=(board,event)=>['INSERT INTO events(board_id,payload,created) VALUES(?,?,?)',[board,JSON.stringify(event),Date.now()]];
async function org(db){return(await db.one("SELECT value FROM settings WHERE key='org'"))?.value||'Minha companhia'}
function validateObject(o){
  if(!o||!['sticky','rect','ellipse','diamond','text','frame','line','pen','image'].includes(o.type))status(400,'Objeto inválido.');
  if(o.text!==undefined&&(typeof o.text!=='string'||o.text.length>20000))status(400,'Texto inválido.');
  for(const k of ['x','y','w','h'])if(typeof o[k]!=='number'||!Number.isFinite(o[k])||Math.abs(o[k])>1e7)status(400,'Posição inválida.');
  if(o.w<=0||o.h<=0)status(400,'Dimensões inválidas.');
  if(typeof o.color!=='string'||!/^#[a-f\d]{6}$/i.test(o.color))status(400,'Cor inválida.');
  if(o.z!==undefined&&!Number.isFinite(o.z))status(400,'Ordem inválida.');
  if(o.type==='pen'&&(!Array.isArray(o.points)||o.points.length<2||o.points.length>5000||o.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e7))))status(400,'Desenho inválido.');
  if(o.type==='line'){if(o.free){if(!Array.isArray(o.points)||o.points.length!==2||o.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)))status(400,'Seta livre inválida.')}else if(!/^[\w-]{1,100}$/.test(o.from)||!/^[\w-]{1,100}$/.test(o.to))status(400,'Conector inválido.')}
  if(o.type==='image'&&(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(o.src||'')||o.src.length>3_500_000))status(400,'Formato de imagem inválido.');
}
async function stream(db,req,res,board,user,client){
  let last=Number(req.headers['last-event-id'])||Number((await db.one('SELECT COALESCE(MAX(seq),0) AS seq FROM events WHERE board_id=?',[board])).seq);
  const write=(event,seq)=>res.write(`${seq?'id: '+seq+'\n':''}data: ${JSON.stringify(event)}\n\n`);
  await db.query('INSERT INTO presence(board_id,client,user_id,seen) VALUES(?,?,?,?) ON CONFLICT(board_id,client) DO UPDATE SET user_id=excluded.user_id,seen=excluded.seen',[board,client,user.id,Date.now()]);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 1500\n\n');write({type:'resync'});
  await new Promise(resolve=>{
    let ended=false,timer,lastCheck=0;
    const end=()=>{if(ended)return;ended=true;clearTimeout(timer);clearTimeout(lifetime);if(!res.writableEnded)res.end();resolve()};
    const lifetime=setTimeout(end,45000);res.on('close',end);res.on('error',end);
    const poll=async()=>{if(ended)return;try{
      if(Date.now()-lastCheck>10000){if(!await auth(db,req)){end();return}await db.query('UPDATE presence SET seen=? WHERE board_id=? AND client=?',[Date.now(),board,client]);lastCheck=Date.now()}
      const rows=await db.query('SELECT seq,payload FROM events WHERE board_id=? AND seq>? ORDER BY seq LIMIT 100',[board,last]);for(const row of rows){write(JSON.parse(row.payload),row.seq);last=Number(row.seq)}
      const online=await db.query('SELECT presence.*,users.name,users.email,users.admin FROM presence JOIN users ON users.id=presence.user_id WHERE board_id=? AND seen>?',[board,Date.now()-30000]);
      write({type:'presence',users:[...new Map(online.map(p=>[p.user_id,safeUser({...p,id:p.user_id})])).values()]});
      for(const p of online)if(p.client!==client&&p.x!==null&&p.y!==null)write({type:'cursor',user:safeUser({...p,id:p.user_id}),client:p.client,x:p.x,y:p.y});res.write(': ping\n\n');
    }catch{end();return}if(!ended)timer=setTimeout(poll,1500)};void poll();
  });
}
export async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  const url=new URL(req.url,'http://localhost'),p=url.pathname,method=req.method;
  const send=(v,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(v))};
  try{
    if(!p.startsWith('/api/')){const file={'/':'index.html','/app.js':'app.js','/canvas-geometry.js':'canvas-geometry.js','/style.css':'style.css','/caaqui.css':'caaqui.css','/brand/caaqui-logo.png':'brand/caaqui-logo.png'}[p]||(/^\/fonts\/poppins-(400|500|600|700)\.ttf$/.test(p)?p.slice(1):null);if(!file)status(404,'Não encontrado.');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':file.endsWith('.ttf')?'font/ttf':'text/html; charset=utf-8');res.end(await readFile(path.join(root,'public',file)));return}
    if(!['GET','HEAD'].includes(method)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)status(403,'Origem inválida.');
    const db=await database();
    if(p==='/api/status'&&method==='GET')return send({setup:!await db.one('SELECT id FROM users LIMIT 1'),org:await org(db)});
    if(['/api/setup','/api/register','/api/login'].includes(p)&&method==='POST'){
      const b=await body(req),email=text(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))status(400,'E-mail inválido.');
      const ip=process.env.VERCEL?String(req.headers['x-forwarded-for']||'unknown').split(',')[0]:req.socket.remoteAddress,bucket=Math.floor(Date.now()/600000),rateKey=digest(ip+':'+email+':'+bucket);
      const rate=await db.one('INSERT INTO auth_attempts(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=auth_attempts.attempts+1 RETURNING attempts',[rateKey,(bucket+1)*600000]);if(rate.attempts>20)status(429,'Muitas tentativas. Aguarde 10 minutos.');
      let user;
      if(p==='/api/login'){
        user=await db.one('SELECT * FROM users WHERE email=?',[email]);const[salt,hash]=(user?.hash||'empty:'+('0'.repeat(128))).split(':');const candidate=await scrypt(String(b.password||'').slice(0,200),salt,64);if(!user||!timingSafeEqual(candidate,Buffer.from(hash,'hex')))status(401,'E-mail ou senha incorretos.');
      }else{
        const setup=p==='/api/setup';if(setup&&await db.one('SELECT id FROM users LIMIT 1'))status(409,'A companhia já foi configurada.');
        if(setup&&process.env.VERCEL&&(!process.env.ELO_SETUP_TOKEN||!timingSafeEqual(Buffer.from(digest(String(b.setupToken||''))),Buffer.from(digest(process.env.ELO_SETUP_TOKEN)))))status(403,'A configuração inicial está desabilitada. Contate o administrador.');
        if(setup&&process.env.VERCEL&&!process.env.ELO_ADMIN_EMAIL)status(503,'O administrador deve configurar ELO_ADMIN_EMAIL na hospedagem.');
        if(setup&&process.env.ELO_ADMIN_EMAIL&&email!==process.env.ELO_ADMIN_EMAIL.toLowerCase())status(403,'A configuração inicial é reservada ao administrador da companhia.');
        if(await db.one('SELECT id FROM users WHERE email=?',[email]))status(409,'E-mail já cadastrado.');
        const name=text(b.name,80),company=setup?text(b.org,80):null,hash=await hashPassword(b.password);user={id:id(),email,name,hash,admin:setup?1:0};
        try{if(!await db.createUser(user,{setup,company,invite:digest(String(b.invite||''))}))status(403,'Convite inválido ou expirado.')}catch(e){if(['23505','SQLITE_CONSTRAINT_PRIMARYKEY','SQLITE_CONSTRAINT_UNIQUE'].includes(e.code))status(409,'A conta ou companhia já foi cadastrada.');throw e}
      }
      await session(db,res,user);return send({user:safeUser(user),org:await org(db)});
    }
    const user=await auth(db,req);if(!user)status(401,'Entre na sua conta para continuar.');
    if(p==='/api/me'&&method==='GET')return send({user:safeUser(user),org:await org(db)});
    if(p==='/api/logout'&&method==='POST'){const token=tokenFrom(req);if(token)await db.query('DELETE FROM sessions WHERE token=?',[digest(token)]);res.setHeader('Set-Cookie',`elo=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure()?'; Secure':''}`);return send({ok:true})}
    if(p==='/api/invites'&&method==='POST'){if(!user.admin)status(403,'Somente administradores podem convidar.');const token=id();await db.query('INSERT INTO invites VALUES(?,?)',[digest(token),Date.now()+7*86400000]);return send({token})}
    if(p==='/api/members'&&method==='GET')return send(await db.query('SELECT id,name,email,admin FROM users'));
    if(p==='/api/boards'&&method==='GET')return send(await db.query('SELECT boards.*,users.name AS author,(SELECT COUNT(*) FROM objects WHERE board_id=boards.id) AS count FROM boards JOIN users ON users.id=boards.owner ORDER BY updated DESC'));
    if(p==='/api/boards'&&method==='POST'){const b=await body(req),board=id();await db.query('INSERT INTO boards VALUES(?,?,?,?)',[board,text(b.title),user.id,Date.now()]);return send({id:board})}
    const match=p.match(/^\/api\/boards\/([a-f0-9]{32})(?:\/(events|objects|comments|cursor))?$/);if(!match)status(404,'Não encontrado.');const board=match[1],part=match[2],record=await db.one('SELECT * FROM boards WHERE id=?',[board]);if(!record)status(404,'Quadro não encontrado.');
    if(!part&&method==='GET')return send({...record,objects:(await db.query('SELECT json FROM objects WHERE board_id=?',[board])).map(o=>JSON.parse(o.json)),comments:await db.query('SELECT comments.*,users.name FROM comments JOIN users ON users.id=comments.user_id WHERE board_id=? ORDER BY created',[board])});
    if(!part&&method==='PATCH'){const b=await body(req),title=text(b.title);await db.batch([['UPDATE boards SET title=?,updated=? WHERE id=?',[title,Date.now(),board]],eventStatement(board,{type:'title',title})]);return send({ok:true})}
    if(!part&&method==='DELETE'){if(record.owner!==user.id&&!user.admin)status(403,'Somente o criador ou administrador pode excluir.');await db.batch([['DELETE FROM boards WHERE id=?',[board]],eventStatement(board,{type:'deleted'})]);return send({ok:true})}
    if(part==='objects'&&method==='PATCH'){
      const b=await body(req);if(!Array.isArray(b.changes)||b.changes.length>500)status(400,'Máximo de 500 alterações por vez.');const changes=b.changes.map(c=>{if(!c||typeof c.id!=='string'||!/^[\w-]{1,100}$/.test(c.id))status(400,'Objeto inválido.');if(c.object){if(c.object.id!==c.id)status(400,'Objeto inválido.');validateObject(c.object)}return{id:c.id,object:c.object||null}});
      await db.batch([...changes.map(c=>c.object?['INSERT INTO objects VALUES(?,?,?) ON CONFLICT(board_id,id) DO UPDATE SET json=excluded.json',[board,c.id,JSON.stringify(c.object)]]:['DELETE FROM objects WHERE board_id=? AND id=?',[board,c.id]]),['UPDATE boards SET updated=? WHERE id=?',[Date.now(),board]],eventStatement(board,{type:'patch',changes,client:String(b.client||'').slice(0,80),name:user.name})]);return send({ok:true});
    }
    if(part==='comments'&&method==='POST'){const b=await body(req),comment={id:id(),board_id:board,user_id:user.id,text:text(b.text,2000),created:Date.now(),name:user.name};await db.batch([['INSERT INTO comments VALUES(?,?,?,?,?)',[comment.id,board,user.id,comment.text,comment.created]],eventStatement(board,{type:'comment',comment})]);return send(comment)}
    if(part==='cursor'&&method==='POST'){const b=await body(req);if(Number.isFinite(b.x)&&Number.isFinite(b.y)&&typeof b.client==='string'&&b.client.length<=80)await db.query('INSERT INTO presence(board_id,client,user_id,x,y,seen) VALUES(?,?,?,?,?,?) ON CONFLICT(board_id,client) DO UPDATE SET user_id=excluded.user_id,x=excluded.x,y=excluded.y,seen=excluded.seen',[board,b.client,user.id,b.x,b.y,Date.now()]);return send({ok:true})}
    if(part==='events'&&method==='GET'){await stream(db,req,res,board,user,String(url.searchParams.get('client')||id()).slice(0,80));return}
    status(405,'Ação não permitida.');
  }catch(e){if(!res.headersSent)send({error:e.status?e.message:'Não foi possível concluir. Tente novamente.'},e.status||500);else res.end();if(!e.status)console.error('Request failed:',e.name,e.code||'unknown')}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))http.createServer(handler).listen(Number(process.env.PORT)||4317,process.env.HOST||'127.0.0.1',()=>console.log(`Miraaqui disponível em http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||4317}`));
