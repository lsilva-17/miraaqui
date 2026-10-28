import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
let connection;
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const coreSchema=`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,hash TEXT NOT NULL,admin INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,expires DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS boards(id TEXT PRIMARY KEY,title TEXT,owner TEXT REFERENCES users(id),updated DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS objects(board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,id TEXT,json TEXT,PRIMARY KEY(board_id,id));
CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id),text TEXT,created DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS presence(board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,client TEXT,user_id TEXT REFERENCES users(id),x DOUBLE PRECISION,y DOUBLE PRECISION,seen DOUBLE PRECISION,PRIMARY KEY(board_id,client));
CREATE TABLE IF NOT EXISTS auth_attempts(key TEXT PRIMARY KEY,attempts INTEGER,expires DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE INDEX IF NOT EXISTS comments_board ON comments(board_id,created);
CREATE INDEX IF NOT EXISTS presence_seen ON presence(board_id,seen);`;
export const postgresSchema=coreSchema+`
CREATE TABLE IF NOT EXISTS events(seq BIGSERIAL PRIMARY KEY,board_id TEXT,payload TEXT,created DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS events_board_seq ON events(board_id,seq);
CREATE INDEX IF NOT EXISTS events_created ON events(created);`;
export function database(){return connection??=connect().catch(e=>{connection=undefined;throw e})}
async function connect(){
  let query,batch,local;
  const remote=!!process.env.DATABASE_URL;
  if(remote){
    const {neon}=await import('@neondatabase/serverless');
    const sql=neon(process.env.DATABASE_URL);
    const parameterize=text=>{let i=0;return text.replace(/\?/g,()=>'$'+(++i))};
    query=(text,args=[])=>sql.query(parameterize(text),args);
    batch=items=>sql.transaction(items.map(([text,args=[]])=>sql.query(parameterize(text),args)));
  }else{
    if(process.env.VERCEL)throw new Error('DATABASE_URL must be configured before deployment');
    const {DatabaseSync}=await import('node:sqlite');
    const directory=process.env.ELO_DATA_DIR||path.join(root,'data');await mkdir(directory,{recursive:true});
    local=new DatabaseSync(path.join(directory,'elo.sqlite'));
    local.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;'+coreSchema+`
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,board_id TEXT,payload TEXT,created DOUBLE PRECISION);
      CREATE INDEX IF NOT EXISTS events_board_seq ON events(board_id,seq);`);
    query=async(text,args=[])=>local.prepare(text).all(...args);
    batch=async items=>{local.exec('BEGIN IMMEDIATE');try{const result=items.map(([text,args=[]])=>local.prepare(text).all(...args));local.exec('COMMIT');return result}catch(e){local.exec('ROLLBACK');throw e}};
  }
  const one=async(text,args=[]) => (await query(text,args))[0];
  async function createUser(user,{setup,company,invite}){
    const values=[user.id,user.email,user.name,user.hash,user.admin];
    if(setup){await batch([['INSERT INTO settings(key,value) VALUES(?,?)',['org',company]],['INSERT INTO users(id,email,name,hash,admin) VALUES(?,?,?,?,?)',values]]);return true}
    if(remote){const rows=await query(`WITH accepted AS (DELETE FROM invites WHERE token=? AND expires>? RETURNING token)
      INSERT INTO users(id,email,name,hash,admin) SELECT ?,?,?,?,? FROM accepted RETURNING id`,[invite,Date.now(),...values]);return rows.length===1}
    local.exec('BEGIN IMMEDIATE');try{const row=local.prepare('DELETE FROM invites WHERE token=? AND expires>? RETURNING token').get(invite,Date.now());if(!row){local.exec('ROLLBACK');return false}local.prepare('INSERT INTO users(id,email,name,hash,admin) VALUES(?,?,?,?,?)').run(...values);local.exec('COMMIT');return true}catch(e){local.exec('ROLLBACK');throw e}
  }
  return {query,one,batch,createUser,remote};
}
