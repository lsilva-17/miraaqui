import {neon} from '@neondatabase/serverless';
import {postgresSchema} from '../lib/database.mjs';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL não configurada.');
const sql=neon(process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL);
await sql.transaction(postgresSchema.split(';').map(s=>s.trim()).filter(Boolean).map(s=>sql.query(s,[])));
console.log('Esquema PostgreSQL verificado.');
