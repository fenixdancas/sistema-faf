const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('manual awards persist independently from notes, with admin-only writes and reversible removal',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;");
 await db.exec(fs.readFileSync('supabase/migrations/20261008190000_prisma_access.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024140000_manual_awards.sql','utf8'));
 const admin='10000000-0000-4000-8000-000000000001',juror='10000000-0000-4000-8000-000000000002',entry='20000000-0000-4000-8000-000000000001',group='20000000-0000-4000-8000-000000000002',mostra='20000000-0000-4000-8000-000000000003';
 await db.query('insert into auth.users values($1),($2)',[admin,juror]);await db.query("insert into prisma_profiles values($1,'Admin',array['admin']),($2,'Júri',array['jurada'])",[admin,juror]);
 for(const [id,payload] of [[entry,{solo:'Estrela'}],[group,{collective:'Trio'}],[mostra,{solo:'Estrela',type:'Mostra'}]])await db.query("insert into prisma_enrollments(id,event,payload) values($1,'faft',$2)",[id,payload]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const save=async(id,e,kind,label,name,active,stamp,event='faft')=>(await db.query('select * from public.prisma_admin_save_award($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,event,e,kind,label,name,'Observação',active,stamp])).rows[0];
 await as(juror);await assert.rejects(save(null,entry,'revelacao','bailarina','Iniciante',true,null));assert.equal((await db.query('select * from prisma_award_selections')).rows.length,0);
 await as(admin);const row=await save(null,group,'revelacao','bailarina','Iniciante',true,null);assert.equal(row.participant_name,'Iniciante');assert.equal(row.actor_id,admin);assert.equal((await db.query('select * from prisma_evaluations')).rows.length,0);
 const changed=await save(row.id,group,'revelacao','bailarino','Outro iniciante',true,row.updated_at);assert.equal(changed.label,'bailarino');
 await assert.rejects(save(row.id,group,'revelacao','bailarina','Desatualizado',true,row.updated_at));
 const removed=await save(row.id,group,'revelacao','bailarino','Outro iniciante',false,changed.updated_at);assert.equal(removed.active,false);assert.equal((await db.query('select * from prisma_award_selections')).rows.length,1);
 const solo=await save(null,entry,'solo','bailarina','',true,null);assert.equal(solo.label,'bailarina');await assert.rejects(save(null,group,'solo','bailarina','',true,null));
 await assert.rejects(save(null,entry,'revelacao','bailarina','',true,null));await assert.rejects(save(null,entry,'revelacao','bailarina','Iniciante',true,null,'faf'));await assert.rejects(save(null,mostra,'revelacao','bailarina','Iniciante',true,null));
 await as(juror);assert.equal((await db.query('select * from prisma_award_selections')).rows.length,0);await assert.rejects(db.query("insert into prisma_award_selections(event,kind,enrollment_id,label,actor_id) values('faft','solo',$1,'bailarina',$2)",[entry,juror]));
 }finally{await db.close();}
});
