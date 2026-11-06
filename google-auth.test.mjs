import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {googleConfig,googleIdentity,googleProvider,googleRoutes} from './lib/google-auth.mjs';
import {googlePictureUrl,memberPublic} from './lib/member-policy.mjs';

const config={clientId:'test-client',clientSecret:'test-secret',redirectUri:'http://localhost:4317/api/auth/google/callback'};
const digest=v=>createHash('sha256').update(v).digest('hex');
const payload={sub:'google-person',email:'colega@caaqui.com',hd:'caaqui.com',email_verified:true,nonce:'nonce',name:'Colega'};
test('Foto de perfil vem apenas da identidade Google validada e expõe somente uma URL de imagem permitida',()=>{
  const picture='https://lh3.googleusercontent.com/a/photo=s96-c';assert.equal(googleIdentity({...payload,picture},'nonce').avatarUrl,picture);assert.equal(memberPublic({name:'Colega',avatar_url:picture}).avatarUrl,picture);
  for(const value of [null,'','javascript:alert(1)','https://evil.test/photo','https://lh3.googleusercontent.com.evil.test/photo','http://lh3.googleusercontent.com/photo','https://user@lh3.googleusercontent.com/photo','https://lh3.googleusercontent.com:8443/photo']){assert.equal(googlePictureUrl(value),'');assert.equal(memberPublic({avatar_url:value}).avatarUrl,undefined)}assert.throws(()=>googleIdentity({...payload,picture,nonce:'wrong'},'nonce'));
});

test('Configuração exige callback fixo HTTPS, com exceção de localhost fora da Vercel',()=>{
  assert.equal(googleConfig({}),null);
  const env={GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:config.redirectUri};
  assert.ok(googleConfig(env));assert.equal(googleConfig({...env,VERCEL:'1'}),null);
  for(const uri of ['http://evil.test/api/auth/google/callback','https://miraaqui.caaqui.link/other','https://user:pass@host/api/auth/google/callback','https://host/api/auth/google/callback?x=1'])assert.equal(googleConfig({...env,GOOGLE_REDIRECT_URI:uri}),null);
});

test('Google exige domínio Workspace, email verificado, subject e nonce correspondentes',()=>{
  assert.equal(googleIdentity(payload,'nonce').email,'colega@caaqui.com');
  for(const change of [{hd:undefined},{hd:'sub.caaqui.com'},{email:'x@caaqui.com.evil.test'},{email:'x@gmail.com'},{email_verified:false},{email_verified:'true'},{sub:''},{nonce:'other'}])assert.throws(()=>googleIdentity({...payload,...change},'nonce'));
});

test('SDK valida assinatura, issuer, audience e validade do ID token antes de aceitar a identidade',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const cert=publicKey.export({format:'pem',type:'spki'}),now=Math.floor(Date.now()/1000);
  const claims={...payload,aud:config.clientId,iss:'https://accounts.google.com',iat:now-10,exp:now+600};
  const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt=(p,key=privateKey)=>{const message=encode({alg:'RS256',kid:'test-key'})+'.'+encode(p);return message+'.'+sign('sha256',Buffer.from(message),key).toString('base64url')};
  let token=jwt(claims);
  mock.method(OAuth2Client.prototype,'getToken',async()=>({tokens:{id_token:token}}));
  mock.method(OAuth2Client.prototype,'getFederatedSignonCertsAsync',async()=>({certs:{'test-key':cert},format:'PEM'}));
  try{
    assert.equal((await googleProvider.finish(config,{code:'code',verifier:'verifier',nonce:'nonce'})).subject,payload.sub);
    for(const change of [{aud:'attacker'},{iss:'https://evil.test'},{exp:now-3600},{nonce:'wrong'},{hd:'evil.test'}]){token=jwt({...claims,...change});await assert.rejects(googleProvider.finish(config,{code:'code',verifier:'verifier',nonce:'nonce'}))}
    token=jwt(claims,generateKeyPairSync('rsa',{modulusLength:2048}).privateKey);await assert.rejects(googleProvider.finish(config,{code:'code',verifier:'verifier',nonce:'nonce'}));
  }finally{mock.restoreAll()}
});

test('Redirect Google usa PKCE S256 e solicita apenas identidade corporativa',async()=>{
  const flow=await googleProvider.begin(config,{state:'state',nonce:'nonce'}),url=new URL(flow.url);
  assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('hd'),'caaqui.com');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('nonce'),'nonce');assert.equal(url.searchParams.get('state'),'state');
  assert.equal(url.searchParams.get('redirect_uri'),config.redirectUri);assert.equal(url.searchParams.get('scope'),'openid email profile');
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(flow.verifier).digest('base64url'));
});

test('Fluxo OAuth preserva conta, perfil, convite único, sessão e destino; rejeita replay e suspensão',async()=>{
  process.env.ELO_DATA_DIR=await mkdtemp(path.join(tmpdir(),'miraaqui-google-'));
  // This suite never uses the live PostgreSQL database.
  delete process.env.DATABASE_URL;delete process.env.VERCEL;
  const {database}=await import('./lib/database.mjs'),db=await database();
  await db.createUser({id:'owner',email:'admin@caaqui.com',name:'Admin',hash:'unused',admin:1},{setup:true,company:'Teste'});
  await db.query("INSERT INTO users(id,email,name,hash,admin,access) VALUES('existing','colega@caaqui.com','Nome local','unused',0,'view')");
  let identity={subject:'google-person',email:'colega@caaqui.com',name:'Colega',avatarUrl:'https://lh3.googleusercontent.com/test-picture=s96-c'},exchanges=0,sessions=[];
  const provider={begin:async(c,{state,nonce})=>({url:'https://accounts.google.com/?state='+state,verifier:'verifier-'+nonce}),finish:async(c,args)=>{exchanges++;assert.equal(args.verifier,'verifier-'+args.nonce);return identity}};
  async function route(target,cookie='',overrides={}){
    const res={headers:{},setHeader(k,v){this.headers[k]=v},writeHead(code,headers={}){this.code=code;Object.assign(this.headers,headers)},end(){}};
    await googleRoutes({db,req:{method:'GET',headers:{host:'localhost:4317',cookie},socket:{remoteAddress:'test'},...overrides},res,url:new URL(target,'http://localhost:4317'),config,provider,session:async(db,res,user)=>{sessions.push(user);res.setHeader('session','issued')},hashPassword:async()=>'random-password-hash'});
    return res;
  }
  async function begin(query=''){const r=await route('/api/auth/google'+query);assert.equal(r.code,303);return {state:new URL(r.headers.Location).searchParams.get('state'),cookie:r.headers['Set-Cookie'].split(';')[0]}}
  const callback=f=>'/api/auth/google/callback?state='+f.state+'&code=code';
  let flow=await begin('?board='+'a'.repeat(32));
  const before=exchanges;assert.match((await route(callback(flow),'miraaqui_google='+'b'.repeat(43))).headers.Location,/expired/);assert.equal(exchanges,before);
  let response=await route(callback(flow),flow.cookie);assert.equal(response.headers.Location,'/#board='+'a'.repeat(32));assert.equal(sessions.at(-1).id,'existing');assert.equal(sessions.at(-1).access,'view');assert.equal(sessions.at(-1).name,'Nome local');assert.equal((await db.one("SELECT avatar_url FROM users WHERE id='existing'")).avatar_url,identity.avatarUrl);
  assert.match(response.headers['Set-Cookie'],/Max-Age=0/);assert.match((await route(callback(flow),flow.cookie)).headers.Location,/expired/);
  const another=await begin();await db.query("UPDATE users SET status='suspended' WHERE id='existing'");assert.match((await route(callback(another),another.cookie)).headers.Location,/blocked/);
  await db.query("UPDATE users SET status='removed' WHERE id='existing'");flow=await begin();assert.match((await route(callback(flow),flow.cookie)).headers.Location,/blocked/);
  await db.query("UPDATE users SET status='active' WHERE id='existing'");identity={...identity,subject:'different-google-person'};flow=await begin();assert.match((await route(callback(flow),flow.cookie)).headers.Location,/identity/);
  identity={subject:'new-subject',email:'novo@caaqui.com',name:'Novo membro'};flow=await begin();assert.match((await route(callback(flow),flow.cookie)).headers.Location,/invite/);assert.equal(await db.one('SELECT id FROM users WHERE email=?',[identity.email]),undefined);
  const invite='single-use-invite';await db.query('INSERT INTO invites VALUES(?,?)',[digest(invite),Date.now()+60000]);flow=await begin('?invite='+invite);response=await route(callback(flow),flow.cookie);assert.equal(response.headers.Location,'/');assert.equal(sessions.at(-1).admin,0);assert.equal(sessions.at(-1).email,identity.email);assert.equal(await db.one('SELECT token FROM invites WHERE token=?',[digest(invite)]),undefined);
  identity={...identity,subject:'new-other',email:'outro@caaqui.com'};flow=await begin('?invite='+invite);assert.match((await route(callback(flow),flow.cookie)).headers.Location,/invite/);
  flow=await begin();await db.query('UPDATE oauth_states SET expires=0 WHERE token=?',[digest(flow.state)]);assert.match((await route(callback(flow),flow.cookie)).headers.Location,/expired/);
  flow=await begin();response=await route('/api/auth/google/callback?state='+flow.state+'&error=access_denied',flow.cookie);assert.match(response.headers.Location,/cancelled/);
  response=await route('/api/auth/google','',{headers:{host:'evil.test'}});assert.match(response.headers.Location,/unavailable/);
  assert.equal((await route('/api/auth/google','',{method:'POST'})).code,405);
});
