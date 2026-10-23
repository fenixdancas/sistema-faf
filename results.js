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
 if(typeof module==='object'&&module.exports)module.exports={classify};else root.PRISMA_RESULTS={classify};
}(typeof window==='undefined'?globalThis:window));
