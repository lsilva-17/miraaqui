import {OAuth2Client,CodeChallengeMethod} from 'google-auth-library';
import {randomBytes,createHash} from 'node:crypto';
import {allowedEmail} from './access-policy.mjs';
import {googlePictureUrl} from './member-policy.mjs';

const random=()=>randomBytes(32).toString('base64url');
const digest=value=>createHash('sha256').update(value).digest('hex');
const cookieName='miraaqui_google';
const callbackPath='/api/auth/google/callback';
const error=(code)=>{throw Object.assign(new Error(code),{googleError:code})};
export const googleErrors={
  unavailable:'O login com Google ainda não está configurado. Entre com sua senha ou contate o administrador.',
  expired:'A tentativa de login expirou ou não pertence a este navegador. Tente novamente.',
  cancelled:'O login com Google foi cancelado. Você pode tentar novamente.',
  domain:'Use sua conta Google corporativa @caaqui.com.',
  invite:'Para o primeiro acesso, use um convite válido do administrador.',
  blocked:'Seu acesso está suspenso ou removido. Contate o administrador.',
  identity:'A conta Google não corresponde ao cadastro. Contate o administrador.',
  failed:'Não foi possível entrar com Google. Tente novamente.',
  limited:'Muitas tentativas de login. Aguarde 10 minutos.'
};

export function googleConfig(env=process.env){
  const {GOOGLE_CLIENT_ID:clientId,GOOGLE_CLIENT_SECRET:clientSecret,GOOGLE_REDIRECT_URI:redirectUri}=env;
  if(!clientId||!clientSecret||!redirectUri)return null;
  try{
    const url=new URL(redirectUri),local=!env.VERCEL&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.pathname!==callbackPath||url.search||url.hash||url.username||url.password||!(url.protocol==='https:'||local&&url.protocol==='http:'))return null;
    return {clientId,clientSecret,redirectUri};
  }catch{return null}
}

// The SDK verifies signature, issuer, audience and expiry; domain and nonce are additional checks.
export function googleIdentity(payload,nonce){
  if(!payload||typeof nonce!=='string'||!nonce||payload.nonce!==nonce)error('expired');
  if(payload.hd!=='caaqui.com'||payload.email_verified!==true||!allowedEmail(payload.email))error('domain');
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255)error('identity');
  return {subject:payload.sub,email:payload.email.trim().toLowerCase(),name:String(payload.name||payload.email.split('@')[0]).trim().slice(0,80),avatarUrl:googlePictureUrl(payload.picture)};
}

function browserCookie(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||''}
function setBrowserCookie(res,value,config){
  res.setHeader('Set-Cookie',`${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${value?600:0}${config.redirectUri.startsWith('https:')?'; Secure':''}`);
}
function redirect(res,to){res.writeHead(303,{'Location':to,'Cache-Control':'no-store'});res.end()}
function client(config){return new OAuth2Client({clientId:config.clientId,clientSecret:config.clientSecret,redirectUri:config.redirectUri})}
export const googleProvider={
  async begin(config,{state,nonce}){
    const oauth=client(config),{codeVerifier,codeChallenge}=await oauth.generateCodeVerifierAsync();
    const url=oauth.generateAuthUrl({scope:['openid','email','profile'],state,nonce,hd:'caaqui.com',prompt:'select_account',code_challenge:codeChallenge,code_challenge_method:CodeChallengeMethod.S256});
    return {url,verifier:codeVerifier};
  },
  async finish(config,{code,verifier,nonce}){
    const oauth=client(config),{tokens}=await oauth.getToken({code,codeVerifier:verifier});
    if(!tokens.id_token)error('failed');
    const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:config.clientId});
    return googleIdentity(ticket.getPayload(),nonce);
  }
};

export async function googleRoutes({db,req,res,url,session,hashPassword,provider=googleProvider,config=googleConfig()}){
  if(!['/api/auth/google','/api/auth/google/callback'].includes(url.pathname))return false;
  if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end();return true}
  if(!config){redirect(res,'/?authError=unavailable');return true}
  let pending;
  try{
    // Always use the configured canonical callback; never derive it from proxy headers.
    if(req.headers.host!==new URL(config.redirectUri).host)error('unavailable');
    if(url.pathname==='/api/auth/google'){
      const ip=process.env.VERCEL?String(req.headers['x-forwarded-for']||'unknown').split(',')[0]:req.socket?.remoteAddress||'unknown',bucket=Math.floor(Date.now()/600000);
      const rate=await db.one('INSERT INTO auth_attempts(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=auth_attempts.attempts+1 RETURNING attempts',[digest('google:'+ip+':'+bucket),(bucket+1)*600000]);
      if(rate.attempts>30)error('limited');
      const state=random(),browser=random(),nonce=random(),board=url.searchParams.get('board')||'',invite=url.searchParams.get('invite')||'';
      const {url:destination,verifier}=await provider.begin(config,{state,nonce});
      await db.query('DELETE FROM oauth_states WHERE expires<=?',[Date.now()]);
      await db.query('INSERT INTO oauth_states VALUES(?,?,?,?)',[digest(state),digest(browser),JSON.stringify({nonce,verifier,invite:digest(invite),board:/^[a-f0-9]{32}$/.test(board)?board:''}),Date.now()+600000]);
      setBrowserCookie(res,browser,config);redirect(res,destination);return true;
    }
    const state=url.searchParams.get('state')||'',browser=browserCookie(req);
    if(!/^[\w-]{43}$/.test(state)||!/^[\w-]{43}$/.test(browser))error('expired');
    const stored=await db.one('DELETE FROM oauth_states WHERE token=? AND browser_hash=? AND expires>? RETURNING payload',[digest(state),digest(browser),Date.now()]);
    if(!stored)error('expired');pending=JSON.parse(stored.payload);
    if(url.searchParams.has('error'))error('cancelled');
    const code=url.searchParams.get('code');if(!code||code.length>4096)error('failed');
    const identity=await provider.finish(config,{code,verifier:pending.verifier,nonce:pending.nonce});
    const linked=await db.one("SELECT users.* FROM oauth_identities JOIN users ON users.id=oauth_identities.user_id WHERE provider='google' AND subject=?",[identity.subject]);
    let user=linked||await db.one('SELECT * FROM users WHERE email=?',[identity.email]);
    if(user){
      if((user.status||'active')!=='active')error('blocked');
      if(user.email.toLowerCase()!==identity.email)error('identity');
      if(!linked){
        await db.query("INSERT INTO oauth_identities(provider,subject,user_id) VALUES('google',?,?) ON CONFLICT DO NOTHING",[identity.subject,user.id]);
        const binding=await db.one("SELECT user_id FROM oauth_identities WHERE provider='google' AND subject=?",[identity.subject]);
        if(binding?.user_id!==user.id)error('identity');
      }
    }else{
      user={id:randomBytes(16).toString('hex'),email:identity.email,name:identity.name,hash:await hashPassword(random()),admin:0};
      if(!await db.createUser(user,{invite:pending.invite,googleSubject:identity.subject}))error('invite');
    }
    await db.query('UPDATE users SET avatar_url=? WHERE id=?',[googlePictureUrl(identity.avatarUrl)||null,user.id]);
    setBrowserCookie(res,'',config);await session(db,res,user);redirect(res,'/'+(pending.board?'#board='+pending.board:''));return true;
  }catch(e){
    // Provider exceptions can contain tokens: never log or return their payloads.
    setBrowserCookie(res,'',config);redirect(res,'/?authError='+(Object.hasOwn(googleErrors,e.googleError)?e.googleError:'failed')+(pending?.board?'#board='+pending.board:''));return true;
  }
}
