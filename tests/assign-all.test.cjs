const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('all presentations: backfill, new entries, new profiles and role isolation',async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261008190000_prisma_access.sql','utf8'));
 const ids=[1,2,3].map(i=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0'));
 for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
 await db.query("insert into prisma_profiles values($1,'Juror',array['jurada']),($2,'Admin',array['admin'])",[ids[0],ids[1]]);
 await db.exec("insert into prisma_enrollments(event,payload) values('faf','{}'),('faft','{}')");
 await db.exec(fs.readFileSync('supabase/migrations/20261010100000_all_presentations.sql','utf8'));
 assert.equal((await db.query('select * from prisma_assignments')).rows.length,2);
 await db.query("insert into prisma_profiles values($1,'Support',array['apoiador'])",[ids[2]]);
 await db.exec("insert into prisma_enrollments(event,payload) values('faf','{}'),('faft','{}')");
 assert.equal((await db.query('select * from prisma_assignments')).rows.length,8);
 await db.query("update prisma_profiles set roles=array['apoiador'] where id=$1",[ids[2]]);
 assert.equal((await db.query('select * from prisma_assignments')).rows.length,8);
 for(const [id,kind,other] of [[ids[0],'jurada','apoiador'],[ids[2],'apoiador','jurada']]){
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
  for(const event of ['faf','faft']){
   assert.equal((await db.query('select * from prisma_my_assignments($1,$2)',[event,kind])).rows.length,2);
   assert.equal((await db.query('select * from prisma_my_assignments($1,$2)',[event,other])).rows.length,0);
  }
  assert.equal((await db.query('select * from prisma_assignments')).rows.length,4);
  await assert.rejects(db.query('select prisma_assign_all_presentations()'));
 }
 await db.close();
});
