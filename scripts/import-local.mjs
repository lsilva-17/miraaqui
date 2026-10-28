import {DatabaseSync} from 'node:sqlite';
import {database} from '../lib/database.mjs';
import {allowedEmail} from '../lib/access-policy.mjs';
const source=process.argv[2];if(!source)throw new Error('Informe o caminho da base SQLite local.');
const db=await database();if(!db.remote)throw new Error('DATABASE_URL deve apontar para o banco remoto.');
if(Number((await db.one('SELECT COUNT(*) AS n FROM users')).n)>0)throw new Error('O destino já tem contas. Importação cancelada sem alterar dados.');
const local=new DatabaseSync(source,{readOnly:true});
const tables={users:['id','email','name','hash','admin'],settings:['key','value'],boards:['id','title','owner','updated'],objects:['board_id','id','json'],comments:['id','board_id','user_id','text','created']};
const sourceUserColumns=new Set(local.prepare('PRAGMA table_info(users)').all().map(c=>c.name));for(const key of ['status','access'])if(sourceUserColumns.has(key))tables.users.push(key);
if(local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='member_audit'").get())tables.member_audit=['id','actor_id','target_id','details','created'];
const commands=[],counts={};
try{local.exec('BEGIN');for(const[table,columns]of Object.entries(tables)){const rows=local.prepare('SELECT '+columns.join(',')+' FROM '+table).all();counts[table]=rows.length;if(table==='users'&&!rows.some(u=>u.admin&&(u.status||'active')==='active'&&allowedEmail(u.email)))throw new Error('A origem deve ter um administrador ativo com e-mail @caaqui.com.');for(const row of rows)commands.push(['INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',columns.map(key=>row[key])])}local.exec('COMMIT')}finally{local.close()}
await db.batch(commands);console.log('Importação concluída:',counts);console.log('Sessões e convites locais não foram transferidos. Entre novamente no endereço publicado.');
