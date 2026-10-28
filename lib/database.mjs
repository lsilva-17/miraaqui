import path from 'node:path';
import {allowedEmail} from './access-policy.mjs';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
let connection;
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const coreSchema=`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,hash TEXT NOT NULL,admin INTEGER DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',access TEXT NOT NULL DEFAULT 'edit');
CREATE TABLE IF NOT EXISTS member_audit(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id),target_id TEXT REFERENCES users(id),details TEXT,created DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS member_audit_target ON member_audit(target_id,created);
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
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS access TEXT NOT NULL DEFAULT 'edit';
CREATE TABLE IF NOT EXISTS events(seq BIGSERIAL PRIMARY KEY,board_id TEXT,payload TEXT,created DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS events_board_seq ON events(board_id,seq);
CREATE INDEX IF NOT EXISTS events_created ON events(created);`;
export function database(){return connection??=connect().catch(e=>{connection=undefined;throw e})}
async function connect(){
  let query,batch,local,serialQuery;
  const remote=!!process.env.DATABASE_URL;
  if(remote){
    const {neon}=await import('@neondatabase/serverless');
    const sql=neon(process.env.DATABASE_URL);
    const parameterize=text=>{let i=0;return text.replace(/\?/g,()=>'$'+(++i))};
    query=(text,args=[])=>sql.query(parameterize(text),args);
    serialQuery=async(text,args)=>{const result=await sql.transaction([sql.query(parameterize(text),args)],{isolationLevel:'Serializable'});return result[0]};
    batch=items=>sql.transaction(items.map(([text,args=[]])=>sql.query(parameterize(text),args)));
  }else{
    if(process.env.VERCEL)throw new Error('DATABASE_URL must be configured before deployment');
    const {DatabaseSync}=await import('node:sqlite');
    const directory=process.env.ELO_DATA_DIR||path.join(root,'data');await mkdir(directory,{recursive:true});
    local=new DatabaseSync(path.join(directory,'elo.sqlite'));
    local.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;'+coreSchema+`
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,board_id TEXT,payload TEXT,created DOUBLE PRECISION);
      CREATE INDEX IF NOT EXISTS events_board_seq ON events(board_id,seq);`);
    const userColumns=new Set(local.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
    if(!userColumns.has('status'))local.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    if(!userColumns.has('access'))local.exec("ALTER TABLE users ADD COLUMN access TEXT NOT NULL DEFAULT 'edit'");
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

  async function updateMember(actorId,targetId,next,{revoke,auditId,details,created}){
    if(remote){
      const statement=`WITH updated AS (UPDATE users SET name=?,email=?,admin=?,access=?,status=? WHERE id=?
        AND EXISTS(SELECT 1 FROM users AS actor WHERE actor.id=? AND actor.admin=1 AND actor.status='active')
        AND NOT(users.id=? AND ?<>'active')
        AND NOT(users.admin=1 AND users.status='active' AND lower(users.email) LIKE '%@caaqui.com' AND ?=0 AND (SELECT COUNT(*) FROM users WHERE admin=1 AND status='active' AND lower(email) LIKE '%@caaqui.com')<=1)
        RETURNING id,name,email,admin,access,status),
        revoked AS (DELETE FROM sessions WHERE user_id IN(SELECT id FROM updated) AND ?=1 RETURNING user_id),
        cleared AS (DELETE FROM presence WHERE user_id IN(SELECT id FROM updated) AND ?=1 RETURNING user_id),
        logged AS (INSERT INTO member_audit(id,actor_id,target_id,details,created) SELECT ?,?,id,?,? FROM updated RETURNING id)
        SELECT * FROM updated`;
      const params=[next.name,next.email,next.admin,next.access,next.status,targetId,actorId,actorId,next.status,next.admin&&next.status==='active'?1:0,revoke?1:0,revoke?1:0,auditId,actorId,details,created];
      for(let attempt=0;attempt<3;attempt++){try{return (await serialQuery(statement,params))[0]||null}catch(error){if(error.code!=='40001'||attempt===2)throw error}}
    }
    local.exec('BEGIN IMMEDIATE');try{
      const actor=local.prepare('SELECT * FROM users WHERE id=?').get(actorId),old=local.prepare('SELECT * FROM users WHERE id=?').get(targetId);
      const admins=local.prepare("SELECT * FROM users WHERE admin=1 AND status='active'").all().filter(u=>allowedEmail(u.email));
      if(!actor?.admin||actor.status!=='active'||!old||actorId===targetId&&next.status!=='active'||old.admin&&old.status==='active'&&allowedEmail(old.email)&&!(next.admin&&next.status==='active')&&admins.length<=1){local.exec('ROLLBACK');return null}
      local.prepare('UPDATE users SET name=?,email=?,admin=?,access=?,status=? WHERE id=?').run(next.name,next.email,next.admin,next.access,next.status,targetId);
      if(revoke){local.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);local.prepare('DELETE FROM presence WHERE user_id=?').run(targetId)}
      local.prepare('INSERT INTO member_audit VALUES(?,?,?,?,?)').run(auditId,actorId,targetId,details,created);
      local.exec('COMMIT');return next;
    }catch(error){local.exec('ROLLBACK');throw error}
  }

  return {query,one,batch,createUser,updateMember,remote};
}
