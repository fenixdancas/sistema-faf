const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify}=require('../results.js');
function fixture(values,event='faft'){
 const entries=values.map((_,i)=>({id:'e'+i,event,payload:{choreo:'Dança '+i,solo:'Estrela',category:event==='faf'?'Amador':'Infantil',ballet:'Livre'}}));
 const assignments=[],evaluations=[];
 values.forEach((jurors,i)=>jurors.forEach((scores,j)=>{const id=i+'-'+j;assignments.push({id,enrollment_id:'e'+i,kind:'jurada',user_id:'u'+j});if(scores!==null)evaluations.push({assignment_id:id,scores:Array.isArray(scores)?scores:Array(11).fill(scores)});}));
 return {entries,assignments,evaluations,event,run(){return classify(this.entries,this.assignments,this.evaluations,this.event)}};
}
test('averages eleven items per juror, then averages jurors; support scores are excluded',()=>{
 const scores=[10,9,8,7,6,5,10,9,8,7,6],f=fixture([[scores,8]]);
 f.assignments.push({id:'support',enrollment_id:'e0',kind:'apoiador'});f.evaluations.push({assignment_id:'support',scores:[5,5]});
 const row=f.run()[0];assert.ok(Math.abs(row.mean-((85/11+8)/2))<1e-9);assert.equal(row.technical,8.25);assert.equal(row.total,2);
});
test('one or two entries use score bands, including fractional boundaries',()=>{
 for(const [score,place] of [[7,3],[7.99,3],[8,2],[8.99,2],[9,1],[10,1]])assert.equal(fixture([[score],[score]]).run()[0].place,place);
 const low=fixture([[6.99]]).run()[0];assert.equal(low.place,null);assert.match(low.status,/inferior/);
});
test('three or more entries rank by score and equal scores use technical average',()=>{
 const a=[10,10,10,10,7,7,7,7,7,7,7],b=[7,7,7,7,10,10,10,10,7,7,7];
 const rows=fixture([[b],[a],[9]]).run();assert.equal(rows[2].place,1);assert.equal(rows[1].place,2);assert.equal(rows[0].place,3);
});
test('persistent ties share a placement and an incomplete category has no placements',()=>{
 const rows=fixture([[9],[9],[8]]).run();assert.deepEqual(rows.map(r=>r.place),[1,1,3]);
 const f=fixture([[9],[8,null],[7]]);assert.ok(f.run().every(r=>r.place===null));assert.match(f.run()[0].status,/conclusão/);
});
test('Mostra excluded, events and categories isolated, incomplete metadata stays unclassified',()=>{
 const f=fixture([[9],[8],[7],[10]]);f.entries[0].payload.type='Mostra';f.entries[3].event='faf';
 const rows=f.run();assert.equal(rows.length,3);assert.equal(rows[0].place,null);assert.equal(rows[1].place,2);assert.equal(rows[2].place,3);
 f.entries[1].payload.solo='Encanto';assert.equal(f.run()[1].place,2);
 f.entries[1].payload.ballet='';assert.match(f.run()[1].status,/incompletos/);assert.equal(f.run()[1].place,null);
});
test('FaF professional and amateur categories remain separate; collective FaFt ignores age category',()=>{
 const f=fixture([[9],[8],[7]],'faf');f.entries[2].payload.category='Profissional';assert.deepEqual(f.run().map(r=>r.place),[1,2,3]);
 const g=fixture([[9],[8],[7]]);g.entries.forEach((e,i)=>{e.payload.solo='Não se aplica';e.payload.collective='Dupla';e.payload.category=i?'Juvenil':'Infantil';});assert.deepEqual(g.run().map(r=>r.place),[1,2,3]);
});
test('missing or invalid juror scores do not produce a completed result',()=>{
 for(const scores of [null,[8,8],Array(11).fill('8'),Array(11).fill(11)]){const f=fixture([[scores]]),row=f.run()[0];assert.equal(row.place,null);assert.equal(row.completed,0);}
});
