const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(role,event='faft',userId='test-user',options={}){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://example.test/prisma/',runScripts:'outside-only'});
 const w=dom.window, calls=[], alerts=[], saved=new Map(); let failReload=false;
 w.PRISMA_CONFIG={supabaseUrl:'https://example.supabase.co',publishableKey:'test-public'};
 w.showScreen=id=>w.document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('on',el.id===id));
 w.setPage=()=>{};w.alert=s=>alerts.push(s);
 w.fetch=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):{};calls.push({path,body});
  let value;
  if(path.includes('/token'))value={access_token:'synthetic',refresh_token:'synthetic',expires_in:3600};
  else if(path.endsWith('/auth/v1/user'))value={id:userId};
  else if(path.includes('/prisma_profiles?'))value=[{id:userId,name:'Teste',roles:[role]}];
  else if(path.endsWith('/prisma_save_evaluation')){saved.set(body.p_assignment,{scores:body.p_scores,comments:body.p_comments});value=null;}
  else if(path.endsWith('/prisma_my_assignments')){
   if(failReload)return {ok:false,status:503,json:async()=>({})};
   value=body.p_kind===role&&body.p_event===event?['a','b'].map(id=>({id,title:'Apresentação '+id,...(saved.get(id)||{scores:null,comments:null})})):[];
  }else value=[];
  return {ok:true,json:async()=>value};
 };
 if(options.beforeInit)options.beforeInit(w,calls);
 w.eval(fs.readFileSync('auth.js','utf8'));
 const login=async()=>{
  w.openRoleLogin(role==='apoiador'?'supporter':'jury');
  w.document.getElementById('juryEmail').value='test@example.test';w.document.getElementById('juryPassword').value='synthetic-test-only';
  await w.enterRole();await w.openRoleEvent(event);
 };
 return {w,calls,alerts,saved,login,failReload:()=>{failReload=true},close:()=>w.close()};
}
for(const role of ['jurada','apoiador'])for(const event of ['faf','faft'])test(role+' '+event+': save, reopen, counters and navigation',async()=>{
 const t=setup(role,event);try{
  await t.login();const w=t.w,id=role==='jurada'?'juryArea':'supporterArea',root=w.document.getElementById(id);
  const counts=()=>[...root.querySelectorAll('.jury-progress span')].map(el=>el.textContent);
  assert.deepEqual(counts(),['2','0']);const select=root.querySelector('select');select.value='b';select.dispatchEvent(new w.Event('change'));
  root.querySelectorAll('input[type=number]').forEach(el=>el.value='8.5');root.querySelector('textarea').value='Comentário persistido';
  await root.querySelector('.save-evaluation').onclick();
  assert.deepEqual(counts(),['1','1']);assert.equal(root.querySelector('select').value,'b');
  assert.equal(root.querySelector('textarea').value,'Comentário persistido');
  await w.openRoleEvent(event);root.querySelector('select').value='b';root.querySelector('select').dispatchEvent(new w.Event('change'));
  assert.equal(root.querySelector('input').value,'8.5');assert.equal(root.querySelector('textarea').value,'Comentário persistido');
  w.showScreen('app');assert.equal(w.document.getElementById('app').classList.contains('on'),false);
  w.showScreen(role==='jurada'?'supporterArea':'juryArea');assert.equal(w.document.getElementById(role==='jurada'?'supporterArea':'juryArea').classList.contains('on'),false);
  await w.openRoleEvent(event==='faf'?'faft':'faf');assert.deepEqual(counts(),['0','0']);assert.equal(root.querySelector('.save-evaluation').disabled,true);
 }finally{t.close()}
});
test('a reload failure after saving remains visible and is not reported as full success',async()=>{
 const t=setup('jurada');try{await t.login();const root=t.w.document.getElementById('juryArea');root.querySelectorAll('input').forEach(el=>el.value='8');t.failReload();await root.querySelector('.save-evaluation').onclick();assert.equal(t.saved.size,1);assert.ok(t.alerts.some(s=>s.includes('recarregar')));assert.ok(!t.alerts.includes('Avaliação salva.'));}finally{t.close()}
});

for(const event of ['faf','faft'])test('own juror photo opens '+event+' and another juror stays protected',async()=>{
 const t=setup('jurada',event,'40dbbe8d-6b17-4fef-98dc-937d009ec080');
 try{await t.login();const w=t.w;const parent=w.document.getElementById(event==='faft'?'faftPending':'app');
 parent.querySelector('[aria-label="Nahid Phoenix"]').click();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(w.document.getElementById('juryEventName').textContent,event==='faft'?'FaFt':'FaF');
 assert.equal(w.document.getElementById('juryArea').classList.contains('on'),true);
 const before=t.calls.length;parent.querySelector('[aria-label="Tati Neri"]').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(t.calls.length,before);assert.ok(t.alerts.some(x=>x.includes('conta desta')));
 }finally{t.close()}
});

test('concurrent login submits only one authentication request',async()=>{
 const t=setup('jurada');try{const w=t.w;w.openRoleLogin('jury');w.document.getElementById('juryEmail').value='test@example.test';w.document.getElementById('juryPassword').value='synthetic-test-only';await Promise.all([w.enterRole(),w.enterRole()]);assert.equal(t.calls.filter(c=>c.path.includes('/token?grant_type=password')).length,1);assert.equal(w.document.getElementById('roleEventSelect').classList.contains('on'),true);}finally{t.close()}
});

for(const [value,message] of [
 [{error:'invalid_grant',error_description:'Invalid login credentials'},'E-mail ou senha inválidos.'],
 [{msg:'email rate limit exceeded'},'O limite de envio de e-mails foi atingido.'],
 [{code:'email_not_confirmed'},'Confirme seu e-mail']
])test('authentication response explains '+message,async()=>{
 const t=setup('jurada');try{t.w.fetch=async()=>({ok:false,status:400,json:async()=>value});t.w.openRoleLogin('jury');t.w.document.getElementById('juryEmail').value='test@example.test';t.w.document.getElementById('juryPassword').value='synthetic-test-only';await t.w.enterRole();assert.ok(t.w.document.getElementById('roleLoginStatus').textContent.startsWith(message));}finally{t.close()}
});
test('expired invitation shows recovery guidance and removes URL error',()=>{
 const t=setup('jurada','faft','test-user',{beforeInit:w=>{w.location.hash='error=access_denied&error_code=otp_expired';}});try{assert.equal(t.w.location.hash,'');assert.ok(t.w.document.getElementById('prismaLoginStatus').textContent.includes('expirou'));assert.equal(t.calls.length,0);}finally{t.close()}
});
test('expired cached session refreshes before requesting protected data',async()=>{
 const t=setup('apoiador','faft','test-user',{beforeInit:w=>w.sessionStorage.setItem('prisma_auth_session_v1',JSON.stringify({access_token:'expired-test',refresh_token:'synthetic-test',expires_at:1}))});try{await new Promise(resolve=>setTimeout(resolve,0));assert.ok(t.calls[0].path.includes('grant_type=refresh_token'));assert.equal(t.w.document.getElementById('roleEventSelect').classList.contains('on'),true);}finally{t.close()}
});

test('mobile receives the final asynchronous login failure',async()=>{
 const t=setup('admin');try{let complete;t.w.fetch=()=>new Promise(resolve=>{complete=resolve});t.w.document.getElementById('prismaEmail').value='test@example.test';t.w.document.getElementById('prismaPassword').value='synthetic-test-only';const pending=t.w.enterFaF();assert.equal(t.w.document.getElementById('prismaMobileStatus').textContent,'Entrando…');complete({ok:false,status:400,json:async()=>({code:'invalid_credentials'})});await pending;assert.equal(t.w.document.getElementById('prismaMobileStatus').textContent,'E-mail ou senha inválidos.');}finally{t.close()}
});

test('administration reads saved scores and comments, separates events, refreshes and clears on logout',async()=>{
 let rows=[{assignment_id:'assigned-1',scores:Array(11).fill(5),comments:'<img src=x onerror=alert(1)> comentário salvo'}];
 const t=setup('admin','faft','admin-test',{beforeInit:w=>{
  const original=w.fetch;w.fetch=async(path,options)=>{
   const data=path.includes('/prisma_profiles?select=')?[{id:'juror-test',name:'Jurada de teste',roles:['jurada']}]:path.includes('/prisma_enrollments?select=')?[{id:'entry-1',event:'faft',payload:{choreo:'Cinema Mudo'}}]:path.includes('/prisma_assignments?select=')?[{id:'assigned-1',enrollment_id:'entry-1',user_id:'juror-test',kind:'jurada'}]:path.includes('/prisma_evaluations?select=')?rows:null;
   return data?{ok:true,json:async()=>data}:original(path,options);
  };
 }});
 try{const w=t.w;w.document.getElementById('prismaEmail').value='test@example.test';w.document.getElementById('prismaPassword').value='synthetic-test-only';await w.enterFaF();await new Promise(r=>setTimeout(r,0));
  const jury=w.document.querySelector('#faft-juri .prisma-admin-evaluations');assert.ok(jury.textContent.includes('Cinema Mudo'));assert.ok(jury.textContent.includes('Jurada de teste'));assert.equal(jury.querySelectorAll('.score-line').length,11);assert.ok(jury.textContent.includes(rows[0].comments));assert.equal(jury.querySelector('img'),null);assert.ok(w.document.querySelector('#faf-juri .prisma-admin-evaluations').textContent.includes('Nenhuma avaliação'));assert.equal(w.document.querySelector('#faft-juri .admin-progress-line strong:last-child').textContent,'1');
  assert.ok(w.document.querySelector('#faft-resultados .prisma-admin-evaluations').textContent.includes('comentário salvo'));
  rows=[];w.setEventPage('faft','juri');await new Promise(r=>setTimeout(r,0));assert.ok(jury.textContent.includes('Nenhuma avaliação'));await w.prismaLogout();assert.equal(w.document.querySelectorAll('.prisma-admin-evaluations').length,0);
 }finally{t.close()}
});
