import {handler} from '../server.mjs';
export default async function api(req,res){
  const url=new URL(req.url,'https://localhost'),route=req.query?.route||url.searchParams.get('route');
  if(route){url.searchParams.delete('route');req.url='/api/'+(Array.isArray(route)?route.join('/'):route)+(url.searchParams.size?'?'+url.searchParams:'')}
  return handler(req,res);
}
