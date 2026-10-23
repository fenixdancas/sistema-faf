(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='./mobile.css?v=20261009-1';document.head.appendChild(l);}());
(function(){
 'use strict';
 const config=window.PRISMA_CONFIG||{}, key='prisma_auth_session_v1';
 const ready=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl||'')&&!!config.publishableKey;
 let session=null,profile=null,selectedRole='admin',selectedEvent='faf',assignments=[],refreshTimer,loginPending=false,adminRefresh=null,adminGeneration=0;
 const rawShow=window.showScreen;
 const roles=['admin','jurada','apoiador'];
 const has=role=>!!profile?.roles?.includes(role);
 function status(message){const roleLogin=document.getElementById('juryLogin')?.classList.contains('on');const p=document.getElementById(roleLogin?'roleLoginStatus':'prismaLoginStatus');if(p)p.textContent=message;if(!roleLogin){const mobile=document.getElementById('prismaMobileStatus');if(mobile)mobile.textContent=message;}}
 async function request(path,{method='GET',body,authenticated=true}={}){
  if(!ready)throw Error('A autenticação ainda precisa ser conectada ao projeto do PRISMA.');
  const response=await fetch(config.supabaseUrl+path,{method,headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(authenticated&&session?{Authorization:'Bearer '+session.access_token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json().catch(()=>null);
  if(!response.ok){
   const code=value?.code||value?.error_code;
   const detail=[value?.msg,value?.message,value?.error_description,value?.error].filter(v=>typeof v==='string').join(' ').toLowerCase();
   if(code==='over_email_send_rate_limit'||detail.includes('email rate limit exceeded'))throw Error('O limite de envio de e-mails foi atingido. Aguarde antes de solicitar outro link.');
   if(code==='otp_expired'||detail.includes('email link is invalid or has expired'))throw Error('O link de acesso expirou. Solicite outro em Primeiro acesso / recuperar senha.');
   if(detail.includes('invalid login credentials'))throw Error('E-mail ou senha inválidos.');
   if(detail.includes('email not confirmed'))throw Error('Confirme seu e-mail pelo link do convite antes de entrar.');
   if(code==='40001')throw Error('A avaliação foi alterada por outra pessoa. Reabra a área para consultar a versão atual antes de salvar.');
   if(code==='invalid_credentials')throw Error('E-mail ou senha inválidos.');
   if(code==='email_not_confirmed')throw Error('Confirme seu e-mail pelo link do convite antes de entrar.');
   if(response.status===429)throw Error('O limite de tentativas ou envios foi atingido. Aguarde antes de tentar novamente.');
   const step=path.startsWith('/auth/v1/token')?'autenticação':path.startsWith('/auth/v1/user')?'sessão':path.startsWith('/rest/v1/prisma_profiles')?'perfil':'consulta';
   throw Error(response.status===401||response.status===403?'E-mail, senha ou permissão inválidos.':'Não foi possível concluir a '+step+' (HTTP '+response.status+(typeof code==='string'&&/^[a-zA-Z0-9_]+$/.test(code)?', '+code:'')+').');
  }
  return value;
 }
 function clear(){adminGeneration++;adminRefresh=null;document.querySelectorAll('.prisma-admin-evaluations').forEach(el=>el.remove());session=null;profile=null;assignments=[];clearTimeout(refreshTimer);sessionStorage.removeItem(key);window.prismaLoadEnrollments?.([]);document.querySelectorAll('input[type=password]').forEach(e=>e.value='');}
 async function establish(tokens,expectedRole){
  session=tokens;
  try{
   const user=await request('/auth/v1/user');
   const rows=await request('/rest/v1/prisma_profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,name,roles');
   profile=rows[0];if(!profile||!Array.isArray(profile.roles)||!profile.roles.every(r=>roles.includes(r))||(expectedRole&&!has(expectedRole)))throw Error('Este usuário não tem acesso a esta área.');
   sessionStorage.setItem(key,JSON.stringify(tokens));
   clearTimeout(refreshTimer);
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
  refreshAdminProgress();
 }
 async function refreshAdminProgress(){
  if(!has('admin'))return;
  if(adminRefresh)return adminRefresh;
  const generation=adminGeneration;
  adminRefresh=readAdminEvaluations(generation).finally(()=>{if(generation===adminGeneration)adminRefresh=null;});
  return adminRefresh;
 }
 async function readAdminEvaluations(generation){
  const lines=[...document.querySelectorAll('.admin-progress-line')];
  try{
   const [people,entries,assigned,evaluations,edits]=await Promise.all([
    request('/rest/v1/prisma_profiles?select=id,name,roles'),
    request('/rest/v1/prisma_enrollments?select=id,event,payload'),
    request('/rest/v1/prisma_assignments?select=id,enrollment_id,user_id,kind'),
    request('/rest/v1/prisma_evaluations?select=assignment_id,scores,comments,updated_at'),
    request('/rest/v1/prisma_evaluation_edits?select=assignment_id,actor_id,before_value,after_value,created_at&order=created_at.desc')
   ]);
   if(generation!==adminGeneration||!has('admin'))return;
   renderAdminEvaluations(people,entries,assigned,evaluations,edits);
   const jurors=people.filter(p=>p.roles.includes('jurada')).length;
   const saved=new Set(evaluations.map(e=>e.assignment_id));
   lines.forEach(line=>{const event=line.closest('#faftPending')?'faft':'faf';const ids=new Set(entries.filter(e=>e.event===event).map(e=>e.id));const values=line.querySelectorAll('strong');values[0].textContent=jurors+' cadastrados';values[1].textContent=assigned.filter(a=>a.kind==='jurada'&&ids.has(a.enrollment_id)&&saved.has(a.id)).length;});
  }catch{if(generation!==adminGeneration||!has('admin'))return;lines.forEach(line=>line.querySelectorAll('strong').forEach(el=>el.textContent='Consulta indisponível'));document.querySelectorAll('.prisma-admin-evaluations').forEach(el=>{el.textContent='Não foi possível consultar as avaliações. Reabra esta área para tentar novamente.';});}
 }
 const juryCriteria=['Execução dos movimentos','Leitura musical','Conhecimento rítmico','Deslocamentos','Expressão facial','Expressão corporal','Interpretação artística','Sincronia','Evolução','Criatividade','Adequação do figurino'];
 function renderAdminEvaluations(people,entries,assigned,evaluations,edits){
  const byPerson=new Map(people.map(p=>[p.id,p])),byEntry=new Map(entries.map(e=>[e.id,e])),byAssignment=new Map(assigned.map(a=>[a.id,a]));
  const records=evaluations.map(v=>{const a=byAssignment.get(v.assignment_id);return {v,a,e:byEntry.get(a?.enrollment_id),p:byPerson.get(a?.user_id)};}).filter(r=>r.a&&r.e);
  function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  for(const event of ['faf','faft'])for(const view of ['juri','destaques','resultados']){
   const page=document.getElementById(event+'-'+view);if(!page)continue;
   let panel=page.querySelector('.prisma-admin-evaluations');
   if(!panel){panel=node('section',undefined,'prisma-admin-evaluations compact-list');panel.setAttribute('aria-label','Avaliações gravadas');(page.querySelector('.jury-workspace')||page.querySelector('.module-wrap')||page).append(panel);}
   const kind=view==='destaques'?'apoiador':'jurada';
   const rows=records.filter(r=>r.e.event===event&&(view==='resultados'||r.a.kind===kind));
   panel.replaceChildren(node('h3','Avaliações gravadas — '+rows.length));
   if(!rows.length)panel.append(node('p','Nenhuma avaliação gravada neste evento.'));
   for(const {v,a,e,p} of rows){
    const detail=node('details',undefined,'compact-card');
    detail.append(node('summary',(e.payload?.choreo||'Apresentação')+' · '+(p?.name||'Avaliador')+' · '+(a.kind==='jurada'?'Júri':'Apoio')));
    const body=node('div',undefined,'compact-body');
    const criteria=a.kind==='jurada'?juryCriteria:['Nota artística do participante','Nota artística da coreografia'];
    const form=node('form'),inputs=[];
    (v.scores||[]).forEach((score,i)=>{const line=node('label',undefined,'score-line'),input=node('input');input.type='number';input.min='5';input.max='10';input.step='0.1';input.required=true;input.value=score;input.setAttribute('aria-label',criteria[i]||'Nota '+(i+1));inputs.push(input);line.append(node('span',criteria[i]||'Nota '+(i+1)),input);form.append(line);});
    const commentLabel=node('label','Observações e sugestões','role-comments'),comment=node('textarea');comment.rows=5;comment.maxLength=10000;comment.value=v.comments||'';commentLabel.append(comment);form.append(commentLabel);
    const submit=node('button','Salvar alterações','save-evaluation');submit.type='submit';const feedback=node('p');feedback.setAttribute('role','status');form.append(submit,feedback);
    form.onsubmit=async ev=>{ev.preventDefault();if(submit.disabled)return;const scores=inputs.map(el=>el.value===''?NaN:Number(el.value));if(scores.length!==criteria.length||scores.some(n=>!Number.isFinite(n)||n<5||n>10)){feedback.textContent='Preencha todas as notas de 5 a 10.';return;}submit.disabled=true;feedback.textContent='Salvando…';try{await request('/rest/v1/rpc/prisma_admin_update_evaluation',{method:'POST',body:{p_assignment:a.id,p_scores:scores,p_comments:comment.value,p_expected_updated_at:v.updated_at}});v.scores=scores;v.comments=comment.value;feedback.textContent='Alterações salvas.';submit.textContent='Salvo';form.querySelectorAll('input,textarea').forEach(el=>el.disabled=true);}catch(error){feedback.textContent=error.message;submit.disabled=false;}};
    body.append(form);
    const changes=edits.filter(change=>change.assignment_id===a.id);
    if(changes.length){const history=node('details');history.append(node('summary','Histórico de alterações — '+changes.length));for(const change of changes){const record=node('div',undefined,'group-card');record.append(node('p',(byPerson.get(change.actor_id)?.name||'Administração')+' · '+new Date(change.created_at).toLocaleString('pt-BR')),node('p','Comentário anterior: '+(change.before_value.comments||'Sem comentário.')),node('p','Comentário revisado: '+(change.after_value.comments||'Sem comentário.')),node('p','Notas anteriores: '+change.before_value.scores.join(' · ')),node('p','Notas revisadas: '+change.after_value.scores.join(' · ')));history.append(record);}body.append(history);}
    detail.append(body);panel.append(detail);
   }
   if(view==='juri'){page.querySelector('.jury-workspace > .jury-sheet')?.remove();page.querySelector('.jury-workspace > .group-card')?.remove();}
   if(view==='destaques'){const label=page.querySelector('.highlight-progress');if(label)label.textContent=rows.length+' avaliações gravadas';const empty=page.querySelector('.highlight-empty');if(empty)empty.textContent=rows.length?'Consulte as notas e os comentários abaixo.':'Aguardando avaliações dos apoiadores.';}
   if(view==='resultados'){const table=page.querySelector('.result-board');if(table)table.remove();const tabs=page.querySelector('.result-tabs');if(tabs)tabs.remove();const result=node('section');result.setAttribute('aria-label','Classificação do júri');result.append(node('h3','Classificação do júri'),node('p','Média das 11 notas de cada jurado, seguida da média entre os jurados. A colocação aguarda todas as avaliações da categoria. Desempate pela média dos quatro itens de Técnica.'));
    const classified=window.PRISMA_RESULTS.classify(entries,assigned,evaluations,event);
    if(!classified.length)result.append(node('p','Nenhuma inscrição neste evento.'));
    for(const row of classified){const detail=node('div',undefined,'group-card');detail.append(node('h4',row.title),node('p',[row.school,row.formation,row.level,row.category,row.modality].filter(Boolean).join(' · ')),node('p','Júri: '+row.completed+'/'+row.total+' avaliações · '+row.status));if(row.mean!==null)detail.append(node('p',(row.completed===row.total?'Média: ':'Média parcial: ')+row.mean.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' · Técnica: '+row.technical.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})));result.append(detail);}
    panel.prepend(result);}
  }
 }
 const originalSetEventPage=window.setEventPage;
 window.setEventPage=function(event,view){
  if(!has('admin'))return;
  const result=originalSetEventPage?.(event,view);
  if(['juri','destaques','resultados'].includes(view))refreshAdminProgress();
  return result;
 };
 async function login(role){
  if(loginPending)return;loginPending=true;
  selectedRole=role;status('Entrando…');
  const email=document.getElementById(role==='admin'?'prismaEmail':'juryEmail').value.trim();
  const passwordInput=document.getElementById(role==='admin'?'prismaPassword':'juryPassword');
  try{
   if(!email||!passwordInput.value)throw Error('Preencha o e-mail e a senha.');
   const tokens=await request('/auth/v1/token?grant_type=password',{method:'POST',authenticated:false,body:{email,password:passwordInput.value}});
   await establish(tokens,role);status('');
   if(role==='admin')await adminHome();else{document.getElementById('roleIdentity').textContent=profile.name;window.showScreen('roleEventSelect');}
  }catch(e){clear();status(e.message);rawShow(role==='admin'?'login':'juryLogin');}finally{passwordInput.value='';loginPending=false;}
 }
 window.enterFaF=()=>has('admin')?adminHome():login('admin');
 window.prismaAbrirPainel=window.enterFaF;
 window.openRoleLogin=function(role){selectedRole=role==='supporter'?'apoiador':'jurada';document.getElementById('roleLoginTitle').textContent=selectedRole==='jurada'?'Acesso do Júri':'Acesso dos Apoiadores';document.getElementById('roleLoginStatus').textContent='';rawShow('juryLogin');};
 const jurorIds={'Tati Neri':'6c38d335-ca10-4d17-ad13-9c24889c090f','Cassiano Rodrigues':'2548b434-3125-43d1-af85-c5b0d9ae34aa','Manu Marques':'aca75f23-482b-48dc-9e17-9d5a22aaa826','Magda El Nil':'fedf41f5-a997-45bf-a7b1-5dcee918dd37','Nahid Phoenix':'40dbbe8d-6b17-4fef-98dc-937d009ec080',"Rawnie El Lamya'":'4bb445c5-9ea4-47f5-bdae-e2b8c14b31cf'};
 document.querySelectorAll('.juror-card').forEach(card=>card.addEventListener('click',async()=>{
  const owner=jurorIds[card.getAttribute('aria-label')];
  if(!profile||!has('jurada'))return window.openRoleLogin('jury');
  if(profile.id!==owner)return alert('Entre com a conta desta jurada ou deste jurado para acessar suas avaliações.');
  selectedRole='jurada';
  const event=card.closest('#faftPending')?'faft':'faf';
  try{await loadRoleEvent(event);}catch(e){alert(e.message);}
 }));
 window.enterRole=()=>login(selectedRole);
 window.prismaLogout=async function(){try{if(session)await request('/auth/v1/logout',{method:'POST'});}finally{clear();rawShow('login');}};
 window.prismaPanelBack=window.prismaLogout;
 window.prismaRecover=async function(){const roleLogin=document.getElementById('juryLogin')?.classList.contains('on');const email=document.getElementById(roleLogin?'juryEmail':'prismaEmail').value.trim();try{if(!email)throw Error('Preencha seu e-mail primeiro.');await request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',authenticated:false,body:{email}});status('Se o e-mail estiver cadastrado, você receberá o link para definir sua senha.');}catch(e){status(e.message);}};
 async function loadRoleEvent(event,preferredAssignment){
  if(!has(selectedRole)||!['faf','faft'].includes(event))return rawShow('login');
  selectedEvent=event;const id=selectedRole==='jurada'?'juryArea':'supporterArea';
  assignments=await request('/rest/v1/rpc/prisma_my_assignments',{method:'POST',body:{p_event:event,p_kind:selectedRole}});renderAssignment(id,preferredAssignment);window.showScreen(id);
 }
 window.openRoleEvent=async function(event){try{await loadRoleEvent(event);}catch(e){alert(e.message);}};
 function renderAssignment(id,preferredAssignment){
  const root=document.getElementById(id),card=root.querySelector('.role-evaluation-card');
  root.querySelector('.jury-user-heading span').textContent=profile.name;
  document.getElementById(id==='juryArea'?'juryEventName':'supporterEventName').textContent=selectedEvent==='faf'?'FaF':'FaFt';
  let select=root.querySelector('.prisma-assignment-select');
  if(!select){select=document.createElement('select');select.className='prisma-assignment-select';select.setAttribute('aria-label','Apresentação');card.prepend(select);select.addEventListener('change',()=>fill(root));}
  select.replaceChildren(...assignments.map(a=>{const option=document.createElement('option');option.value=a.id;option.textContent=a.title;return option;}));if(assignments.some(a=>a.id===preferredAssignment))select.value=preferredAssignment;fill(root);
  const counts=root.querySelectorAll('.jury-progress span');counts[0].textContent=assignments.filter(a=>!a.scores).length;counts[1].textContent=assignments.filter(a=>a.scores).length;
  const button=root.querySelector('.save-evaluation');button.disabled=!assignments.length;button.title='';button.onclick=()=>save(root);
 }
 function fill(root){const a=assignments.find(a=>a.id===root.querySelector('select').value);root.querySelector('.role-presentation span').textContent=a?a.title:'Nenhuma apresentação atribuída a você neste evento.';root.querySelectorAll('input[type=number]').forEach((el,i)=>el.value=a?.scores?.[i]??'');root.querySelector('textarea').value=a?.comments||'';}
 async function save(root){const a=assignments.find(a=>a.id===root.querySelector('select').value);if(!a)return;const input=[...root.querySelectorAll('input[type=number]')];const scores=input.map(x=>x.value===''?NaN:Number(x.value));const button=root.querySelector('.save-evaluation');if(scores.some(v=>!Number.isFinite(v)||v<5||v>10))return alert('Preencha todas as notas de 5 a 10.');button.disabled=true;try{await request('/rest/v1/rpc/prisma_save_evaluation',{method:'POST',body:{p_assignment:a.id,p_scores:scores,p_comments:root.querySelector('textarea').value}});try{await loadRoleEvent(selectedEvent,a.id);}catch{alert('Avaliação salva, mas não foi possível recarregar a lista. Reabra o evento para atualizar as notas e os contadores.');return;}alert('Avaliação salva.');}catch(e){alert(e.message);}finally{button.disabled=false;}}
 document.querySelectorAll('#roleEventSelect button,#juryArea .role-top-actions button,#supporterArea .role-top-actions button').forEach(button=>{if(button.textContent.trim()==='Sair')button.onclick=window.prismaLogout;});
 document.querySelectorAll('.prisma-exit').forEach(button=>button.onclick=window.prismaLogout);
 document.querySelectorAll('.jury-back').forEach(button=>button.onclick=()=>rawShow('login'));
 const recovery=document.createElement('button');recovery.type='button';recovery.className='jury-back';recovery.textContent='Primeiro acesso / recuperar senha';recovery.onclick=window.prismaRecover;document.querySelector('.jury-login-card').append(recovery);
 for(const [id,role] of [['prismaPassword','admin'],['juryPassword',null]])document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')login(role||selectedRole);});
 // Password links are generated by the administrator; only the recipient sets the password.
 async function init(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('error')||fragment.has('error_code')){
   history.replaceState(null,'',location.pathname+location.search);clear();rawShow('login');
   status(fragment.get('error_code')==='otp_expired'?'O link de acesso expirou ou já foi utilizado. Solicite outro em Primeiro acesso / recuperar senha.':'Não foi possível validar o link de acesso. Solicite outro em Primeiro acesso / recuperar senha.');return;
  }
  if(fragment.has('access_token')&&fragment.has('refresh_token')){
   const tokens={access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),expires_in:Number(fragment.get('expires_in')||3600)};history.replaceState(null,'',location.pathname+location.search);
   try{await establish(tokens);const panel=document.createElement('section');panel.className='screen on';panel.innerHTML='<div class="jury-login-shell"><form class="jury-login-card"><h1>Definir senha</h1><label>Nova senha<input type="password" autocomplete="new-password" minlength="8" required></label><label>Confirme a senha<input type="password" autocomplete="new-password" minlength="8" required></label><button class="jury-enter">Salvar senha</button><p role="status"></p></form></div>';document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));document.body.append(panel);panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const inputs=panel.querySelectorAll('input');const out=panel.querySelector('p');if(inputs[0].value!==inputs[1].value){out.textContent='As senhas não conferem.';return;}try{await request('/auth/v1/user',{method:'PUT',body:{password:inputs[0].value}});panel.remove();await window.prismaLogout();}catch(error){out.textContent=error.message;}};}catch(error){status(error.message);}return;
  }
  const cached=sessionStorage.getItem(key);if(cached&&ready){try{const stored=JSON.parse(cached);if(stored.expires_at&&stored.expires_at*1000<=Date.now()+60000){session=stored;const renewed=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',authenticated:false,body:{refresh_token:stored.refresh_token}});await establish(renewed);}else await establish(stored);selectedRole=has('admin')?'admin':has('jurada')?'jurada':'apoiador';if(selectedRole==='admin')await adminHome();else{document.getElementById('roleIdentity').textContent=profile.name;window.showScreen('roleEventSelect');}}catch{clear();rawShow('login');}}
 }
 clearTimeout(refreshTimer);init();
})();
