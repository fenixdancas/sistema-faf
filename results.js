(function(root){
 'use strict';
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
 const present=value=>value&&normalize(value)!=='NAO SE APLICA';
 const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
 const equal=(a,b)=>Math.abs(a-b)<1e-9;
 function classify(entries,assignments,evaluations,event){
  const saved=new Map(evaluations.map(v=>[v.assignment_id,v]));
  const groups=new Map(),rows=[];
  for(const entry of entries.filter(e=>e.event===event)){
   const p=entry.payload||{},formation=present(p.collective)?p.collective:(present(p.solo)?'Solo':p.formation||''),solo=normalize(formation)==='SOLO';
   const modality=p.modality||['ballet','belly','folklore','diverse'].map(key=>p[key]).find(present)||'';
   const category=solo?(present(p.solo)?p.solo:p.category||''):(event==='faf'?p.category||'':formation);
   const level=event==='faf'?p.category||'':'';
   const jurors=assignments.filter(a=>a.enrollment_id===entry.id&&a.kind==='jurada');
   const valid=jurors.map(a=>saved.get(a.id)).filter(v=>Array.isArray(v?.scores)&&v.scores.length===11&&v.scores.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=5&&n<=10));
   const row={id:entry.id,title:p.choreo||'Apresentação',school:p.school||'',formation,category,modality,level,total:jurors.length,completed:valid.length,mean:valid.length?average(valid.map(v=>average(v.scores))):null,technical:valid.length?average(valid.map(v=>average(v.scores.slice(0,4)))):null,place:null};
   row.mostra=[p.category,p.solo,p.collective,p.type].some(value=>normalize(value).includes('MOSTRA'));
   row.status=row.mostra?'Mostra — sem classificação':!formation||!category||!modality||event==='faf'&&!level?'Dados da categoria incompletos':!jurors.length||valid.length!==jurors.length?'Aguardando notas do júri':'Pronta';
   rows.push(row);
   if(row.mostra||row.status==='Dados da categoria incompletos')continue;
   const key=JSON.stringify([formation,category,modality,level].map(normalize));
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  for(const group of groups.values()){
   if(group.some(row=>row.status!=='Pronta')){group.forEach(row=>{if(row.status==='Pronta')row.status='Aguardando conclusão da categoria';});continue;}
   group.sort((a,b)=>equal(a.mean,b.mean)?(equal(a.technical,b.technical)?0:b.technical-a.technical):b.mean-a.mean);
   let previous=null;
   group.forEach((row,index)=>{
    if(row.mean<7&&!equal(row.mean,7)){row.status='Não classificada — média inferior a 7';return;}
    row.place=group.length<=2?(row.mean>=9||equal(row.mean,9)?1:row.mean>=8||equal(row.mean,8)?2:3):(previous&&equal(row.mean,previous.mean)&&equal(row.technical,previous.technical)?previous.place:index+1);
    row.status=row.place<=3?row.place+'º lugar':'Sem colocação entre os três primeiros';previous=row;
   });
  }
  return rows;
 }
 function highlights(entries,assignments,evaluations,event){
  const saved=new Map(evaluations.map(v=>[v.assignment_id,v])),rows=[];
  for(const entry of entries.filter(e=>e.event===event)){
   const p=entry.payload||{};
   if([p.category,p.solo,p.collective,p.type].some(value=>normalize(value).includes('MOSTRA')))continue;
   const formation=present(p.collective)?p.collective:present(p.solo)?'Solo':p.formation||'';
   const supporters=assignments.filter(a=>a.enrollment_id===entry.id&&a.kind==='apoiador');
   const valid=supporters.map(a=>saved.get(a.id)).filter(v=>Array.isArray(v?.scores)&&v.scores.length===2&&v.scores.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=5&&n<=10));
   rows.push({id:entry.id,title:p.choreo||'Apresentação',school:p.school||'',participant:p.certificate||p.participant||p.participants||'',formation,total:supporters.length,completed:valid.length,complete:supporters.length>0&&valid.length===supporters.length,participantMean:valid.length?average(valid.map(v=>v.scores[0])):null,choreographyMean:valid.length?average(valid.map(v=>v.scores[1])):null});
  }
  const groups=[];
  function rank(label,candidates,metric){
   const ready=candidates.length>0&&candidates.every(row=>row.complete);
   const ranked=candidates.map(row=>({...row,mean:row[metric],position:null,tied:false})).sort((a,b)=>a.mean===null?b.mean===null?0:1:b.mean===null?-1:b.mean-a.mean);
   if(ready)ranked.forEach((row,index)=>{row.position=index&&equal(row.mean,ranked[index-1].mean)?ranked[index-1].position:index+1;row.tied=ranked.some(other=>other.id!==row.id&&equal(other.mean,row.mean));});
   groups.push({label,ready,rows:ranked});
  }
  for(const formation of ['Solo','Dupla','Trio','Grupo'])rank(formation,rows.filter(row=>normalize(row.formation)===normalize(formation)),'participantMean');
  rank('Coreografia',rows,'choreographyMean');
  const unknown=rows.filter(row=>!['SOLO','DUPLA','TRIO','GRUPO'].includes(normalize(row.formation)));
  if(unknown.length)rank('Formação a conferir',unknown,'participantMean');
  return groups;
 }
 if(typeof module==='object'&&module.exports)module.exports={classify,highlights};else root.PRISMA_RESULTS={classify,highlights};
}(typeof window==='undefined'?globalThis:window));
