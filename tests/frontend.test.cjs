const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(role,event='faft',userId='test-user'){
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
