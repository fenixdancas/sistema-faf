const {test}=require('node:test'),assert=require('node:assert/strict');
const {highlights}=require('../results.js');
function fixture(){
 const entries=['Solo','Dupla','Trio','Grupo'].map((formation,i)=>({id:'e'+i,event:'faft',payload:{choreo:'Dança '+i,formation,participant:'Nome '+i}}));
 const assignments=entries.flatMap(e=>['s1','s2'].map(user_id=>({id:e.id+user_id,enrollment_id:e.id,user_id,kind:'apoiador'})));
 const evaluations=assignments.map((a,i)=>({assignment_id:a.id,scores:i%2?[10,6]:[8,10]}));
 return {entries,assignments,evaluations,run(){return highlights(this.entries,this.assignments,this.evaluations,'faft')}};
}
test('supporter participant and choreography means are independent, jury excluded',()=>{
 const f=fixture();f.assignments.push({id:'jury',enrollment_id:'e0',kind:'jurada'});f.evaluations.push({assignment_id:'jury',scores:Array(11).fill(5)});
 const groups=f.run();assert.equal(groups[0].rows[0].mean,9);assert.equal(groups[4].rows[0].mean,8);assert.equal(groups[0].rows[0].total,2);
});
test('unfinished supporter evaluations block final positions across each candidate list',()=>{
 const f=fixture();f.evaluations.pop();const groups=f.run();assert.equal(groups[0].ready,true);assert.equal(groups[3].ready,false);assert.equal(groups[4].ready,false);assert.ok(groups[4].rows.every(r=>r.position===null));
});
test('supporter ties remain explicit with no automatic tiebreak',()=>{
 const g=fixture().run()[4];assert.equal(g.ready,true);assert.ok(g.rows.every(r=>r.position===1&&r.tied));
});
test('events and Mostra are isolated and names do not infer gender or revelation',()=>{
 const f=fixture();f.entries[1].payload.type='Mostra';f.entries[2].event='faf';const groups=f.run();assert.equal(groups[1].rows.length,0);assert.equal(groups[2].rows.length,0);assert.equal(groups[4].rows.length,2);assert.equal(groups[0].label,'Solo');assert.ok(!groups.some(g=>/Revelação|Bailarina|Bailarino/.test(g.label)));
});
test('invalid, absent and unassigned scores cannot count as completed',()=>{
 for(const scores of [[8],['8',9],[11,8],null]){const f=fixture();f.evaluations[0].scores=scores;const g=f.run()[0];assert.equal(g.ready,false);assert.equal(g.rows[0].completed,1);}
 const f=fixture();f.assignments=[];assert.equal(f.run()[0].ready,false);
});
test('collective field takes precedence over stale solo age and unknown formation remains visible',()=>{
 const f=fixture();f.entries[0].payload={choreo:'Teste',solo:'Estrela',collective:'Trio'};f.entries[1].payload.formation='';const groups=f.run();assert.equal(groups[0].rows.length,0);assert.equal(groups[2].rows.length,2);assert.equal(groups.at(-1).label,'Formação a conferir');assert.equal(groups.at(-1).rows.length,1);
});
