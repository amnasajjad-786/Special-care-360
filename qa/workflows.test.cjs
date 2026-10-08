const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('../frontend/node_modules/typescript');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
let env;
const child = {name:'Synthetic child',dob:'2020-01-01',diagnosis:'Test',centerId:'c1',parentId:'p1',teacherId:'t1',therapistIds:['h1'],enrollmentDate:'2026-10-06',iepStatus:'Active',photoUrl:''};
before(async () => {
  env = await initializeTestEnvironment({ projectId:'demo-special-care-workflows', firestore:{host:'127.0.0.1',port:8087,rules:fs.readFileSync('../firestore.rules','utf8')} });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = sdk.writeBatch(db);
    batch.set(sdk.doc(db,'centers/c1'), {centerId:'c1'});
    for (const [uid,role] of [['a1','admin'],['t1','teacher'],['h1','therapist'],['p1','parent'],['p2','parent']]) batch.set(sdk.doc(db,'users',uid), {uid,role,status:'approved',centerId:'c1'});
    batch.set(sdk.doc(db,'students/s1'),child);
    batch.set(sdk.doc(db,'students/s1/medicalProfile/main'),{allergies:[],medications:[]});
    batch.set(sdk.doc(db,'students/s1/carePlan/main'),{goals:[{id:'g1',title:'First'},{id:'g2',title:'Second'}],version:0});
    batch.set(sdk.doc(db,'dailyCareJournals/history'),{studentId:'s1',centerId:'c1',parentId:'p1',submittedBy:'t1'});
    batch.set(sdk.doc(db,'homePlanActivities/activity'),{studentId:'s1',centerId:'c1',parentId:'p1',assignedBy:'h1'});
    batch.set(sdk.doc(db,'homePlanMessages/message'),{studentId:'s1',centerId:'c1',parentId:'p1',activityId:'activity',senderId:'h1',senderRole:'therapist',text:'Practice feedback',createdAt:sdk.Timestamp.now()});
    await batch.commit();
  });
});
after(async () => env?.cleanup());

function modules(uid, extra = {}) {
  const db = env.authenticatedContext(uid).firestore();
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const source = fs.readFileSync(`../frontend/lib/${name}.ts`,'utf8');
    const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const mod = {exports:{}};
    const requireModule = path => {
      if (path === 'firebase/firestore') return sdk;
      if (path === './firebase') return {db,auth:{currentUser:{uid,getIdToken:async()=> 'synthetic'}}};
      if (path === 'uuid') return {v4:()=>crypto.randomUUID()};
      if (path === './api') return {api:{post:async()=>{throw new Error('Simulated network outage')}}};
      if (path.startsWith('./')) return load(path.slice(2));
      throw new Error('Unexpected module '+path);
    };
    // Compile in this realm: Firestore intentionally rejects objects with a
    // foreign realm's prototype. Only module dependencies/browser globals vary.
    const execute = new Function('module','exports','require','console','Date','setTimeout','clearTimeout','Blob','URL','process','document',code);
    execute(mod,mod.exports,requireModule,console,Date,setTimeout,clearTimeout,Blob,extra.URL || URL,{env:{}},extra.document);
    cache[name] = mod.exports;
    return mod.exports;
  }
  return {db,load};
}

test('regression history reads are scoped, sort persisted dates and reject empty centre', async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const [id,date] of [['older','2026-09-01T10:00:00Z'],['newer','2026-10-07T10:00:00Z']]) {
      await sdk.setDoc(sdk.doc(db,'milestoneObservations',id),{studentId:'s1',centerId:'c1',parentId:'p1',goalId:'g1',observedAt:date});
      await sdk.setDoc(sdk.doc(db,'regressionAlerts',id),{studentId:'s1',centerId:'c1',parentId:'p1',goalId:'g1',resolved:false,createdAt:sdk.Timestamp.fromDate(new Date(date))});
    }
  });
  const teacher=modules('t1').load('firestore-api');
  const history=await teacher.milestoneObservationsDb.listForStudent('s1','c1');
  assert.deepEqual(history.map(x=>x.id),['newer','older']);
  const alerts=await teacher.regressionDb.listForStudent('s1','c1');
  assert.deepEqual(alerts.map(x=>x.id),['newer','older']);
  assert.equal(typeof alerts[0].createdAt,'string');
  await assert.rejects(teacher.milestoneObservationsDb.listForStudent('s1',''));
  await assert.rejects(teacher.milestoneObservationsDb.log({centerId:''},child));
});

test('actual frontend enrollment commits all documents and invalid guardian leaves none', async()=>{
  const {db,load} = modules('a1');
  const api = load('firestore-api');
  const id = await api.studentsDb.create(child);
  for (const path of [`students/${id}`,`students/${id}/medicalProfile/main`,`students/${id}/carePlan/main`]) assert.equal((await sdk.getDoc(sdk.doc(db,path))).exists(),true);
  const studentQuery = sdk.query(sdk.collection(db,'students'),sdk.where('centerId','==','c1'));
  const before = (await sdk.getDocs(studentQuery)).size;
  await assert.rejects(api.studentsDb.create({...child,parentId:'missing'}));
  assert.equal((await sdk.getDocs(studentQuery)).size,before);
});

test('unauthorized removal preserves every record; admin removal atomically archives', async()=>{
  const teacher = modules('t1');
  await assert.rejects(teacher.load('firestore-api').studentsDb.delete('s1','c1'));
  const admin = modules('a1');
  for (const path of ['students/s1','students/s1/medicalProfile/main','students/s1/carePlan/main','dailyCareJournals/history']) assert.equal((await sdk.getDoc(sdk.doc(admin.db,path))).exists(),true);
  await admin.load('firestore-api').studentsDb.delete('s1','c1');
  assert.ok((await sdk.getDoc(sdk.doc(admin.db,'students/s1'))).data().archivedAt);
  const therapist = modules('h1');
  await assert.rejects(therapist.load('firestore-api').studentsDb.updateCarePlan('s1', {goals:[],expectedVersion:0}));
  for (const path of ['students/s1/medicalProfile/main','students/s1/carePlan/main','dailyCareJournals/history']) assert.equal((await sdk.getDoc(sdk.doc(admin.db,path))).exists(),true);
  assert.equal((await admin.load('firestore-api').studentsDb.list({role:'admin',uid:'a1',centerId:'c1'})).length,0);
});

test('ABC preserves selected occurrence time after reload', async()=>{
  const {db,load} = modules('t1');
  const timestamp = '2026-10-03T08:30:00.000Z';
  const id = await load('firestore-api').abcDb.logIncident({studentId:'s1',timestamp,behavior:{text:'Synthetic'},antecedent:{},consequence:{},severity:1},'t1');
  assert.equal((await sdk.getDoc(sdk.doc(db,'abcIncidents',id))).data().timestamp,timestamp);
});

test('saved draft reload restores draft goals rather than previous active goals', async()=>{
  const {db,load} = modules('h1');
  await load('firestore-api').iepDb.saveDraft('s1',{goals:[{id:'draft1',title:'Draft goal'}],summary:'Draft summary',expectedVersion:0},'h1','Test therapist');
  const care = (await sdk.getDoc(sdk.doc(db,'students/s1/carePlan/main'))).data();
  const restored = load('workflow-state').restoreIep(care,true);
  assert.equal(restored.goals[0].id,'draft1');
  assert.equal(restored.summary,'Draft summary');
  assert.equal(restored.draft,true);
  assert.equal(load('workflow-state').restoreIep(care,false).goals[0].id,'g1');
});

test('concurrent goal achievements preserve both histories and unknown IDs fail', async()=>{
  const {db,load} = modules('h1');
  const iep = load('firestore-api').iepDb;
  await Promise.all([iep.markGoalAchieved('s1','g1'),iep.markGoalAchieved('s1','g2')]);
  const care = (await sdk.getDoc(sdk.doc(db,'students/s1/carePlan/main'))).data();
  assert.equal(care.goals.length,0);
  assert.deepEqual(care.achievedGoals.map(goal=>goal.id).sort(),['g1','g2']);
  assert.equal(care.version,2);
  await assert.rejects(iep.markGoalAchieved('s1','unsaved'));
});

test('duplicate concurrent suggestion acceptance is idempotent', async()=>{
  const {db,load} = modules('h1');
  const iep = load('firestore-api').iepDb;
  const goal = {id:'next1',title:'Next goal'};
  await iep.savePendingAiGoal('s1',goal);
  await Promise.all([iep.acceptPendingAiGoal('s1',goal),iep.acceptPendingAiGoal('s1',goal)]);
  const care = (await sdk.getDoc(sdk.doc(db,'students/s1/carePlan/main'))).data();
  assert.equal(care.goals.filter(item=>item.id==='next1').length,1);
  assert.equal(care.pendingAiGoal,null);
});

test('last-goal deletion persists; stale editor and finalization cannot overwrite newer plan', async()=>{
  const {db,load} = modules('h1');
  const api = load('firestore-api');
  await api.studentsDb.updateCarePlan('s1',{goals:[],expectedVersion:0});
  assert.equal((await sdk.getDoc(sdk.doc(db,'students/s1/carePlan/main'))).data().goals.length,0);
  await assert.rejects(api.studentsDb.updateCarePlan('s1',{goals:[{id:'stale'}],expectedVersion:0}));
  await assert.rejects(api.iepDb.finalize('s1',{goals:[{id:'stale'}],expectedVersion:0}));
  assert.equal((await sdk.getDoc(sdk.doc(db,'students/s1/carePlan/main'))).data().goals.length,0);
});

test('actual discussion subscription loads with guardian scope', async()=>{
  const {load} = modules('p1');
  await new Promise((resolve,reject)=>{
    let stop;
    const timer = setTimeout(()=>{stop?.();reject(new Error('Thread subscription timed out'));},8000);
    stop = load('teletherapy-api').homePlanDb.subscribeMessages('activity','s1',{role:'parent',uid:'p1',centerId:'c1'},messages=>{
      if (!messages.length) return;
      clearTimeout(timer); stop(); assert.equal(messages[0].text,'Practice feedback');resolve();
    },error=>{clearTimeout(timer);stop?.();reject(error)});
  });
});

test('API outage records panic as pending, never delivered', async()=>{
  const {db,load} = modules('t1');
  const result = await load('firestore-api').panicDb.sendAlert({studentId:'s1',centerId:'c1',reportedBy:{uid:'t1',name:'Test'},emergencyType:'Test',description:'Synthetic',location:'Test room'},async()=> 'token');
  assert.equal(result.deliveryStatus,'pending');
  assert.equal((await sdk.getDoc(sdk.doc(db,'panicAlerts',result.id))).data().deliveryStatus,'pending');
});

test('offline writes have a bounded unconfirmed result rather than hanging', async()=>{
  const {load} = modules('t1');
  const workflow = load('workflow-state');
  assert.equal(await workflow.confirmWithin(Promise.resolve(),10),true);
  assert.equal(await workflow.confirmWithin(new Promise(()=>{}),10),false);
  await assert.rejects(workflow.confirmWithin(Promise.reject(new Error('Permission denied')),10));
});

test('CSV download creates a real file and escapes formulas, quotes and newlines',()=>{
  let clicked = false, removed = false, filename, blob;
  const link = {click(){clicked=true},remove(){removed=true},set download(value){filename=value},set href(value){}};
  const {load} = modules('a1',{URL:{createObjectURL(value){blob=value;return 'blob:test'},revokeObjectURL(){}},document:{createElement(){return link},body:{appendChild(){}}}});
  const workflow = load('workflow-state');
  assert.match(workflow.csvText([['=1+1','a"b','line\nnext']]), /'=1\+1/);
  workflow.downloadCsv('Invoice test.csv',[['Invoice','Amount'],['test',100]]);
  assert.equal(clicked,true);assert.equal(removed,true);assert.equal(filename,'Invoice_test.csv');assert.ok(blob instanceof Blob);
});
