import {allowedEmail} from './access-policy.mjs';
export const memberRole=u=>u.admin?'admin':u.access==='view'?'viewer':'editor';
export function memberPublic(u){return {id:u.id,email:u.email,name:u.name,admin:!!u.admin,role:memberRole(u),status:u.status||'active'}}
export function memberUpdate(old,body,actorId){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Dados de membro inválidos.'),{status:400});
  if(Object.keys(body).some(k=>!['name','email','role','status'].includes(k)))throw Object.assign(new Error('Campo de membro inválido.'),{status:400});
  const name=body.name===undefined?old.name:String(body.name).trim(),email=body.email===undefined?old.email:String(body.email).trim().toLowerCase(),role=body.role??memberRole(old),status=body.status??old.status??'active';
  if(!name||name.length>80)throw Object.assign(new Error('Informe um nome de até 80 caracteres.'),{status:400});
  if((body.email!==undefined||status==='active')&&(!allowedEmail(email)||email.length>254))throw Object.assign(new Error('Use um e-mail @caaqui.com.'),{status:400});
  if(!['admin','editor','viewer'].includes(role)||!['active','suspended','removed'].includes(status))throw Object.assign(new Error('Perfil ou status inválido.'),{status:400});
  if(old.id===actorId&&status!=='active')throw Object.assign(new Error('Você não pode suspender ou remover o próprio acesso.'),{status:409});
  const next={...old,name,email,admin:role==='admin'?1:0,access:role==='viewer'?'view':'edit',status};
  return {next,revoke:email!==old.email||role!==memberRole(old)||status!==(old.status||'active')};
}
