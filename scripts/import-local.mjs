import {DatabaseSync} from 'node:sqlite';
import {database} from '../lib/database.mjs';
const source=process.argv[2];if(!source)throw new Error('Informe o caminho da base SQLite local.');
const db=await database();if(!db.remote)throw new Error('DATABASE_URL deve apontar para o banco remoto.');
if(Number((await db.one('SELECT COUNT(*) AS n FROM users')).n)>0)throw new Error('O destino já tem contas. Importação cancelada sem alterar dados.');
const local=new DatabaseSync(source,{readOnly:true});
const tables={users:['id','email','name','hash','admin'],settings:['key','value'],boards:['id','title','owner','updated'],objects:['board_id','id','json'],comments:['id','board_id','user_id','text','created']};
const commands=[],counts={};
try{local.exec('BEGIN');for(const[table,columns]of Object.entries(tables)){const rows=local.prepare('SELECT '+columns.join(',')+' FROM '+table).all();counts[table]=rows.length;for(const row of rows)commands.push(['INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',columns.map(key=>row[key])])}local.exec('COMMIT')}finally{local.close()}
await db.batch(commands);console.log('Importação concluída:',counts);console.log('Sessões e convites locais não foram transferidos. Entre novamente no endereço publicado.');
