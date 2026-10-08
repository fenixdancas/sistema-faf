// Run only on a trusted machine. This generates links without sending messages.
import {readFile,writeFile} from 'node:fs/promises';
const url=process.env.SUPABASE_URL, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret||!process.argv[2])throw Error('Informe SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e o caminho da importação privada.');
const source=JSON.parse(await readFile(process.argv[2],'utf8'));
async function call(path,body,method='POST'){
 const response=await fetch(url+path,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify(body)});
 if(!response.ok)throw Error('Falha no provisionamento; operação '+path+' retornou '+response.status);
 return response.status===204?null:response.json().catch(()=>null);
}
const links=[];
for(const person of [...source.accounts.jurados,...source.accounts.apoiadores]){
 const result=await call('/auth/v1/admin/generate_link?redirect_to='+encodeURIComponent(process.env.PRISMA_SITE_URL||''),{type:'invite',email:person.email});
 const user=result.user||result;if(!user?.id)throw Error('Não foi possível gerar o acesso.');
 await call('/rest/v1/prisma_profiles?on_conflict=id',{id:user.id,name:person.nome,roles:person.perfis});
 links.push({name:person.nome,email:person.email,link:result.action_link||result.properties?.action_link});
}
await writeFile('access-links.json',JSON.stringify(links,null,2),{mode:0o600});
// Existing enrollment IDs are deterministic, so rerunning does not duplicate records.
for(const [i,payload] of source.enrollments.entries()){
 const id='faft';const uuid='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
 await call('/rest/v1/prisma_enrollments?on_conflict=id',{id:uuid,event:id,payload});
}
console.log('Perfis e inscrições importados. Links privados gravados em access-links.json; nenhum e-mail enviado.');
