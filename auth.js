(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='./mobile.css?v=20261009-1';document.head.appendChild(l);}());
(function(){
 'use strict';
 const config=window.PRISMA_CONFIG||{}, key='prisma_auth_session_v1';
 const ready=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl||'')&&!!config.publishableKey;
 let session=null,profile=null,selectedRole='admin',selectedEvent='faf',assignments=[],refreshTimer;
 const rawShow=window.showScreen;
 const roles=['admin','jurada','apoiador'];
 const has=role=>!!profile?.roles?.includes(role);
 function status(message){const p=document.getElementById(selectedRole==='admin'?'prismaLoginStatus':'roleLoginStatus');if(p)p.textContent=message;}
 async function request(path,{method='GET',body,authenticated=true}={}){
  if(!ready)throw Error('A autenticação ainda precisa ser conectada ao projeto do PRISMA.');
  const response=await fetch(config.supabaseUrl+path,{method,headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(authenticated&&session?{Authorization:'Bearer '+session.access_token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Error(response.status===401||response.status===403?'E-mail, senha ou permissão inválidos.':'Não foi possível concluir. Tente novamente.');
  return value;
 }
 function clear(){session=null;profile=null;assignments=[];clearTimeout(refreshTimer);sessionStorage.removeItem(key);window.prismaLoadEnrollments?.([]);document.querySelectorAll('input[type=password]').forEach(e=>e.value='');}
 async function establish(tokens,expectedRole){
  session=tokens;
  try{
   const user=await request('/auth/v1/user');
   const rows=await request('/rest/v1/prisma_profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,name,roles');
   profile=rows[0];if(!profile||!Array.isArray(profile.roles)||!profile.roles.every(r=>roles.includes(r))||(expectedRole&&!has(expectedRole)))throw Error('Este usuário não tem acesso a esta área.');
   sessionStorage.setItem(key,JSON.stringify(tokens));
   refreshTimer=setTimeout(refresh,Math.max(1000,((tokens.expires_in||3600)-60)*1000));
   return profile;
  }catch(e){clear();throw e;}
 }
 async function refresh(){try{const tokens=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',authenticated:false,body:{refresh_token:session.refresh_token}});await establish(tokens);}catch{clear();rawShow('login');status('A sessão terminou. Entre novamente.');}}
 window.showScreen=function(id){
  const admin=['app','faftPending','select'];
  if(admin.includes(id)&&!has('admin'))return rawShow('login');
  if(id==='juryArea'&&!has('jurada'))return rawShow('login');
  if(id==='supporterArea'&&!has('apoiador'))return rawShow('login');
  if(id==='roleEventSelect'&&!has(selectedRole))return rawShow('login');
  return rawShow(id);
 };
 async function adminHome(){
  if(!has('admin'))return rawShow('login');
  const rows=await request('/rest/v1/prisma_enrollments?event=eq.faft&select=payload&order=created_at.asc');
  window.prismaLoadEnrollments?.(rows.map(r=>r.payload));
  window.showScreen('app');window.setPage('inicio');
 }
 async function login(role){
  selectedRole=role;status('Entrando…');
  const email=document.getElementById(role==='admin'?'prismaEmail':'juryEmail').value.trim();
  const passwordInput=document.getElementById(role==='admin'?'prismaPassword':'juryPassword');
  try{
   if(!email||!passwordInput.value)throw Error('Preencha o e-mail e a senha.');
   const tokens=await request('/auth/v1/token?grant_type=password',{method:'POST',authenticated:false,body:{email,password:passwordInput.value}});
   await establish(tokens,role);status('');
   if(role==='admin')await adminHome();else{document.getElementById('roleIdentity').textContent=profile.name;window.showScreen('roleEventSelect');}
  }catch(e){clear();status(e.message);rawShow(role==='admin'?'login':'juryLogin');}finally{passwordInput.value='';}
 }
 window.enterFaF=()=>has('admin')?adminHome():login('admin');
 window.prismaAbrirPainel=window.enterFaF;
 window.openRoleLogin=function(role){selectedRole=role==='supporter'?'apoiador':'jurada';document.getElementById('roleLoginTitle').textContent=selectedRole==='jurada'?'Acesso do Júri':'Acesso dos Apoiadores';document.getElementById('roleLoginStatus').textContent='';rawShow('juryLogin');};
 window.enterRole=()=>login(selectedRole);
 window.prismaLogout=async function(){try{if(session)await request('/auth/v1/logout',{method:'POST'});}finally{clear();rawShow('login');}};
 window.prismaPanelBack=window.prismaLogout;
 window.prismaRecover=async function(){const email=document.getElementById(selectedRole==='admin'?'prismaEmail':'juryEmail').value.trim();try{if(!email)throw Error('Preencha seu e-mail primeiro.');await request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',authenticated:false,body:{email}});status('Se o e-mail estiver cadastrado, você receberá o link para definir sua senha.');}catch(e){status(e.message);}};
 window.openRoleEvent=async function(event){
  if(!has(selectedRole)||!['faf','faft'].includes(event))return rawShow('login');
  selectedEvent=event;const id=selectedRole==='jurada'?'juryArea':'supporterArea';
  try{assignments=await request('/rest/v1/rpc/prisma_my_assignments',{method:'POST',body:{p_event:event,p_kind:selectedRole}});renderAssignment(id);window.showScreen(id);}catch(e){status(e.message);}
 };
 function renderAssignment(id){
  const root=document.getElementById(id),card=root.querySelector('.role-evaluation-card');
  root.querySelector('.jury-user-heading span').textContent=profile.name;
  document.getElementById(id==='juryArea'?'juryEventName':'supporterEventName').textContent=selectedEvent==='faf'?'FaF':'FaFt';
  let select=root.querySelector('.prisma-assignment-select');
  if(!select){select=document.createElement('select');select.className='prisma-assignment-select';select.setAttribute('aria-label','Apresentação');card.prepend(select);select.addEventListener('change',()=>fill(root));}
  select.replaceChildren(...assignments.map(a=>{const option=document.createElement('option');option.value=a.id;option.textContent=a.title;return option;}));fill(root);
  const counts=root.querySelectorAll('.jury-progress span');counts[0].textContent=assignments.filter(a=>!a.scores).length;counts[1].textContent=assignments.filter(a=>a.scores).length;
  const button=root.querySelector('.save-evaluation');button.disabled=!assignments.length;button.title='';button.onclick=()=>save(root);
 }
 function fill(root){const a=assignments.find(a=>a.id===root.querySelector('select').value);root.querySelector('.role-presentation span').textContent=a?a.title:'Nenhuma apresentação atribuída a você neste evento.';root.querySelectorAll('input[type=number]').forEach((el,i)=>el.value=a?.scores?.[i]??'');root.querySelector('textarea').value=a?.comments||'';}
 async function save(root){const a=assignments.find(a=>a.id===root.querySelector('select').value);if(!a)return;const input=[...root.querySelectorAll('input[type=number]')];const scores=input.map(x=>x.value===''?NaN:Number(x.value));const button=root.querySelector('.save-evaluation');if(scores.some(v=>!Number.isFinite(v)||v<5||v>10))return alert('Preencha todas as notas de 5 a 10.');button.disabled=true;try{await request('/rest/v1/rpc/prisma_save_evaluation',{method:'POST',body:{p_assignment:a.id,p_scores:scores,p_comments:root.querySelector('textarea').value}});await window.openRoleEvent(selectedEvent);alert('Avaliação salva.');}catch(e){alert(e.message);}finally{button.disabled=false;}}
 document.querySelectorAll('#roleEventSelect button,#juryArea .role-top-actions button,#supporterArea .role-top-actions button').forEach(button=>{if(button.textContent.trim()==='Sair')button.onclick=window.prismaLogout;});
 document.querySelectorAll('.prisma-exit').forEach(button=>button.onclick=window.prismaLogout);
 document.querySelectorAll('.jury-back').forEach(button=>button.onclick=()=>rawShow('login'));
 const recovery=document.createElement('button');recovery.type='button';recovery.className='jury-back';recovery.textContent='Primeiro acesso / recuperar senha';recovery.onclick=window.prismaRecover;document.querySelector('.jury-login-card').append(recovery);
 for(const [id,role] of [['prismaPassword','admin'],['juryPassword',null]])document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')login(role||selectedRole);});
 // Password links are generated by the administrator; only the recipient sets the password.
 async function init(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('access_token')&&fragment.has('refresh_token')){
   const tokens={access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),expires_in:Number(fragment.get('expires_in')||3600)};history.replaceState(null,'',location.pathname+location.search);
   try{await establish(tokens);const panel=document.createElement('section');panel.className='screen on';panel.innerHTML='<div class="jury-login-shell"><form class="jury-login-card"><h1>Definir senha</h1><label>Nova senha<input type="password" autocomplete="new-password" minlength="8" required></label><label>Confirme a senha<input type="password" autocomplete="new-password" minlength="8" required></label><button class="jury-enter">Salvar senha</button><p role="status"></p></form></div>';document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));document.body.append(panel);panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const inputs=panel.querySelectorAll('input');const out=panel.querySelector('p');if(inputs[0].value!==inputs[1].value){out.textContent='As senhas não conferem.';return;}try{await request('/auth/v1/user',{method:'PUT',body:{password:inputs[0].value}});panel.remove();await window.prismaLogout();}catch(error){out.textContent=error.message;}};}catch(error){status(error.message);}return;
  }
  const cached=sessionStorage.getItem(key);if(cached&&ready){try{await establish(JSON.parse(cached));selectedRole=has('admin')?'admin':has('jurada')?'jurada':'apoiador';if(selectedRole==='admin')await adminHome();else{document.getElementById('roleIdentity').textContent=profile.name;window.showScreen('roleEventSelect');}}catch{clear();rawShow('login');}}
 }
 clearTimeout(refreshTimer);init();
})();
