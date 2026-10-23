const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {PGlite}=require(process.env.PRISMA_PGLITE_PATH||'@electric-sql/pglite');
test('RLS isolates profiles, private records and assigned evaluations',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261008190000_prisma_access.sql','utf8'));
 const ids=[1,2,3,4].map(i=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0'));
 for(const [i,role] of ['admin','jurada','jurada','apoiador'].entries()){await db.query('insert into auth.users values($1)',[ids[i]]);await db.query('insert into prisma_profiles values($1,$2,array[$3])',[ids[i],'Test '+i,role]);}
 const entry='20000000-0000-4000-8000-000000000001',assignment='30000000-0000-4000-8000-000000000001',support='30000000-0000-4000-8000-000000000002';
 await db.query('insert into prisma_enrollments(id,event,payload) values($1,$2,$3)',[entry,'faft',{choreo:'Test',email:'private@example.test'}]);
 for(const [id,user,kind] of [[assignment,ids[1],'jurada'],[support,ids[3],'apoiador']])await db.query('insert into prisma_assignments(id,enrollment_id,user_id,kind) values($1,$2,$3,$4)',[id,entry,user,kind]);
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await as(ids[1]);assert.equal((await db.query('select * from prisma_enrollments')).rows.length,0);assert.equal((await db.query('select * from prisma_profiles')).rows.length,1);assert.equal((await db.query("select * from prisma_my_assignments('faft','jurada')")).rows.length,1);await assert.rejects(db.query("update prisma_profiles set roles=array['admin']"));await db.query('select prisma_save_evaluation($1,$2,$3)',[assignment,Array(11).fill(8),'OK']);await assert.rejects(db.query('select prisma_save_evaluation($1,$2,$3)',[assignment,Array(11).fill(11),'invalid']));await assert.rejects(db.query('select prisma_save_evaluation($1,$2,$3)',[assignment,[8,8],'invalid']));
 await as(ids[2]);assert.equal((await db.query("select * from prisma_my_assignments('faft','jurada')")).rows.length,0);await assert.rejects(db.query('select prisma_save_evaluation($1,$2,$3)',[assignment,Array(11).fill(8),'no']));assert.equal((await db.query('select * from prisma_evaluations')).rows.length,0);
 await as(ids[3]);assert.equal((await db.query("select * from prisma_my_assignments('faft','jurada')")).rows.length,0);await db.query('select prisma_save_evaluation($1,$2,$3)',[support,[8,9],'OK']);await assert.rejects(db.query('select prisma_save_evaluation($1,$2,$3)',[support,Array(11).fill(8),'invalid']));
 await as(ids[0]);assert.equal((await db.query('select * from prisma_enrollments')).rows.length,1);assert.equal((await db.query('select * from prisma_evaluations')).rows.length,2);await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20261023140000_admin_evaluation_edits.sql','utf8'));
 await as(ids[1]);await assert.rejects(db.query('select prisma_admin_update_evaluation($1,$2,$3,$4)',[assignment,Array(11).fill(9),'forbidden',null]));
 await as(ids[0]);const before=(await db.query('select * from prisma_evaluations where assignment_id=$1',[assignment])).rows[0];
 await db.query('select prisma_admin_update_evaluation($1,$2,$3,$4)',[assignment,Array(11).fill(9),'Comentário revisado',before.updated_at]);
 const after=(await db.query('select * from prisma_evaluations where assignment_id=$1',[assignment])).rows[0];assert.equal(after.user_id,ids[1]);assert.equal(after.comments,'Comentário revisado');assert.deepEqual(after.scores,Array(11).fill(9));
 const history=(await db.query('select * from prisma_evaluation_edits')).rows;assert.equal(history.length,1);assert.equal(history[0].actor_id,ids[0]);assert.equal(history[0].before_value.comments,'OK');
 await assert.rejects(db.query('select prisma_admin_update_evaluation($1,$2,$3,$4)',[assignment,Array(11).fill(8),'stale',before.updated_at]));
 await assert.rejects(db.query('select prisma_admin_update_evaluation($1,$2,$3,$4)',[assignment,Array(11).fill(11),'invalid',after.updated_at]));
 await as(ids[3]);assert.equal((await db.query('select * from prisma_evaluation_edits')).rows.length,0);
 await db.close();
});
