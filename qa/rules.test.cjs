const { test, before, after } = require('node:test');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, writeBatch, serverTimestamp } = require('firebase/firestore');
let env;
const child = { name: 'Synthetic student', centerId: 'c1', parentId: 'p1', teacherId: 't1', therapistIds: ['h1'] };
const linked = { studentId: 's1', centerId: 'c1', parentId: 'p1' };
const records = ['students/s1', 'students/s1/medicalProfile/main', 'students/s1/carePlan/main', 'students/s1/iepRecords/record', 'students/s1/medicationAdministrations/dose', 'dailyCareJournals/journal', 'abcIncidents/incident', 'panicAlerts/alert', 'homePlanActivities/activity', 'homePlanLogs/log', 'homePlanMessages/message', 'teletherapySessions/session', 'invoices/invoice', 'payments/payment', 'regressionAlerts/regression', 'staff/staff', 'notifications/notification'];
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-special-care-rules', firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('../firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'centers/c1'), { centerId: 'c1' });
    for (const [uid, role] of [['a1','admin'], ['a2','admin'], ['t1','teacher'], ['t2','teacher'], ['h1','therapist'], ['h2','therapist'], ['p1','parent'], ['p2','parent'], ['pending','admin'], ['disabled','teacher']]) {
      batch.set(doc(db, 'users', uid), { uid, role, centerId: uid === 'a2' ? 'c2' : 'c1', status: uid === 'pending' ? 'pending' : uid === 'disabled' ? 'disabled' : 'approved' });
    }
    for (const path of records) batch.set(doc(db, path), path === 'students/s1' ? child : { ...linked, recipientId: 'a1', senderId: 'h1', activityId: 'activity', assignedBy: 'h1', therapistId: 'h1', reportedBy: { uid: 't1' }, status: 'active', deliveryStatus: 'pending', goals: [], allergies: [] });
    await batch.commit();
  });
});
after(async () => env?.cleanup());
const dbOf = uid => env.authenticatedContext(uid).firestore();

test('regression observations and alerts are child-scoped and server-owned', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'milestoneObservations/observation'), {...linked, goalId:'g1', observedBy:'t1'});
  });
  for (const uid of ['t1','h1','a1']) {
    const db = dbOf(uid);
    await assertSucceeds(getDocs(query(collection(db,'regressionAlerts'), where('studentId','==','s1'), where('centerId','==','c1'))));
    await assertSucceeds(getDoc(doc(db,'milestoneObservations/observation')));
    await assertFails(setDoc(doc(db,'milestoneObservations/forged'), {...linked, observedBy:uid}));
    await assertFails(setDoc(doc(db,'regressionAlerts/forged'), {...linked, resolved:false}));
  }
  for (const uid of ['t2','h2','a2','p1','pending']) {
    await assertFails(getDoc(doc(dbOf(uid),'regressionAlerts/regression')));
    if (uid !== 'p1') await assertFails(getDoc(doc(dbOf(uid),'milestoneObservations/observation')));
  }
  // The child's own guardian may read progress history (not regression alerts).
  await assertSucceeds(getDoc(doc(dbOf('p1'),'milestoneObservations/observation')));
  await assertFails(getDoc(doc(dbOf('p2'),'milestoneObservations/observation')));
  await assertFails(updateDoc(doc(dbOf('t1'),'regressionAlerts/regression'), {resolved:true}));
  await assertFails(updateDoc(doc(dbOf('h1'),'regressionAlerts/regression'), {centerId:'c2'}));
  await assertSucceeds(updateDoc(doc(dbOf('h1'),'regressionAlerts/regression'), {resolved:true}));
});

test('every protected rule rejects pending and disabled reads, writes and deletes', async () => {
  for (const uid of ['pending','disabled']) {
    const db = dbOf(uid);
    for (const path of records) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ...linked, goals: [], status: 'approved', administeredBy: uid }));
      await assertFails(setDoc(doc(db, path + '-new'), { ...linked, goals: [], status: 'approved', administeredBy: uid, uid }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    await assertFails(setDoc(doc(db, 'centers/c1'), { centerId: 'c1' }));
    await assertFails(setDoc(doc(db, 'feeConfig/c1'), {}));
    await assertFails(setDoc(doc(db, 'users/p1'), { uid:'p1', status:'approved', role:'admin', centerId:'c1' }));
  }
});

test('cross-family, class, therapist and centre reads are denied for clinical records', async () => {
  const clinical = records.filter(path => !['staff/staff','notifications/notification','invoices/invoice','payments/payment','regressionAlerts/regression'].includes(path));
  for (const uid of ['p2','t2','h2','a2']) {
    const db = dbOf(uid);
    for (const path of clinical) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(updateDoc(doc(db, path), {notes:'Unauthorized cross-scope edit'}));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});

test('forged UID, role and approval cannot be written through self-service', async () => {
  for (const update of [{uid:'p1'}, {role:'admin'}, {status:'disabled'}, {centerId:'c2'}]) {
    await assertFails(updateDoc(doc(dbOf('t1'), 'users/t1'), update));
  }
  await assertFails(updateDoc(doc(dbOf('pending'), 'users/pending'), {status:'approved'}));
  await assertSucceeds(updateDoc(doc(dbOf('t1'), 'users/t1'), {name:'New name'}));
  await assertFails(setDoc(doc(dbOf('new'), 'users/new'), {uid:'p1', role:'parent', status:'pending', centerId:'c1'}));
  await assertFails(setDoc(doc(dbOf('new'), 'users/new'), {uid:'new', role:'parent', status:'pending', centerId:'missing'}));
  await assertFails(updateDoc(doc(dbOf('a1'), 'users/a2'), {centerId:'c1', status:'approved'}));
  await assertFails(deleteDoc(doc(dbOf('a1'), 'users/t1')));
});

test('class and therapist queries enforce assignment at the database', async () => {
  for (const [uid, field, op] of [['t1','teacherId','=='], ['h1','therapistIds','array-contains']]) {
    const db = dbOf(uid);
    await assertFails(getDocs(query(collection(db,'students'), where('centerId','==','c1'))));
    await assertSucceeds(getDocs(query(collection(db,'students'), where('centerId','==','c1'), where(field,op,uid))));
  }
});

test('malformed references and forged actors cannot create clinical records', async () => {
  const db = dbOf('t1');
  await assertFails(setDoc(doc(db,'abcIncidents/bad'), {...linked, studentId:'missing', loggedBy:'t1'}));
  await assertFails(setDoc(doc(db,'abcIncidents/bad'), {...linked, parentId:'p2', loggedBy:'t1'}));
  await assertFails(setDoc(doc(db,'abcIncidents/bad'), {...linked, centerId:'c2', loggedBy:'t1'}));
  await assertFails(setDoc(doc(db,'abcIncidents/bad'), {...linked, loggedBy:'t2'}));
  await assertFails(setDoc(doc(db,'dailyCareJournals/bad'), {...linked, submittedBy:'t2'}));
  await assertFails(setDoc(doc(db,'homePlanLogs/bad'), {...linked, activityId:'missing'}));
  await assertFails(setDoc(doc(dbOf('p1'),'homePlanLogs/bad'), {...linked, activityId:'missing'}));
  await assertFails(setDoc(doc(dbOf('p1'),'homePlanMessages/bad'), {...linked, activityId:'activity', senderId:'h1', senderRole:'therapist'}));
  await assertFails(setDoc(doc(db,'notifications/bad'), {...linked, senderId:'t1', recipientId:'a2', type:'behavior_incident'}));
  await assertFails(setDoc(doc(db,'notifications/bad'), {...linked, senderId:'t1', recipientId:'p1', type:'panic_alert'}));
  await assertFails(setDoc(doc(db,'panicAlerts/bad'), {...linked, reportedBy:{uid:'t2'}, status:'active', deliveryStatus:'pending'}));
  await assertFails(setDoc(doc(db,'panicAlerts/bad'), {...linked, id:'other-alert', reportedBy:{uid:'t1'}, status:'active', deliveryStatus:'pending'}));
  await assertFails(updateDoc(doc(dbOf('a1'),'panicAlerts/alert'), {centerId:'c2'}));
});

test('enrollment requires all main documents and approved valid assignments atomically', async () => {
  const db = dbOf('a1');
  await assertFails(setDoc(doc(db,'students/incomplete'), child));
  const batch = writeBatch(db);
  batch.set(doc(db,'students/atomic'), child);
  batch.set(doc(db,'students/atomic/medicalProfile/main'), {allergies:[]});
  batch.set(doc(db,'students/atomic/carePlan/main'), {goals:[]});
  await assertSucceeds(batch.commit());
  const invalid = writeBatch(db);
  invalid.set(doc(db,'students/invalid'), {...child, therapistIds:['p1']});
  invalid.set(doc(db,'students/invalid/medicalProfile/main'), {allergies:[]});
  invalid.set(doc(db,'students/invalid/carePlan/main'), {goals:[]});
  await assertFails(invalid.commit());
  await env.withSecurityRulesDisabled(async context => {
    for (const path of ['students/invalid','students/invalid/medicalProfile/main','students/invalid/carePlan/main']) {
      if ((await getDoc(doc(context.firestore(),path))).exists()) throw new Error('Failed enrollment persisted a partial document');
    }
  });
});

test('child record queries and activity threads can prove authorized scope', async () => {
  for (const uid of ['p1','t1','h1']) {
    const db = dbOf(uid);
    await assertSucceeds(getDocs(query(collection(db,'homePlanMessages'), where('activityId','==','activity'), where('studentId','==','s1'), where(uid === 'p1' ? 'parentId' : 'centerId','==',uid === 'p1' ? 'p1' : 'c1'))));
    await assertSucceeds(getDocs(query(collection(db,'abcIncidents'), where('studentId','==','s1'), where(uid === 'p1' ? 'parentId' : 'centerId','==',uid === 'p1' ? 'p1' : 'c1'))));
  }
  await assertFails(getDocs(query(collection(dbOf('h2'),'homePlanMessages'), where('activityId','==','activity'), where('studentId','==','s1'), where('centerId','==','c1'))));
});

test('guardians can query their own invoices and payments but not another family', async () => {
  for (const name of ['invoices','payments']) {
    await assertSucceeds(getDocs(query(collection(dbOf('p1'),name),where('studentId','==','s1'),where('parentId','==','p1'))));
    await assertFails(getDocs(query(collection(dbOf('p2'),name),where('studentId','==','s1'),where('parentId','==','p1'))));
  }
});

test('parent can submit one bank transfer reference; only staff can mark invoice paid', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'invoices/invoice'), { ...linked, amount: 1000, status: 'pending' });
  });
  const invoice = doc(dbOf('p1'), 'invoices/invoice');
  await assertSucceeds(updateDoc(invoice, {
    transferSubmission: { reference: 'TX-12345', submittedBy: 'p1', submittedAt: serverTimestamp(), status: 'pending' },
  }));
  await assertFails(updateDoc(invoice, {
    transferSubmission: { reference: 'ALTERED-12345', submittedBy: 'p1', submittedAt: serverTimestamp(), status: 'pending' },
  }));
  await assertFails(updateDoc(invoice, { status: 'paid' }));
  await assertSucceeds(updateDoc(doc(dbOf('a1'), 'invoices/invoice'), { status: 'paid' }));
});

test('clinical edits and directory removal cannot bypass assignment or erase child history', async () => {
  await assertFails(updateDoc(doc(dbOf('h2'),'students/s1/carePlan/main'), {goals:[]}));
  await assertFails(updateDoc(doc(dbOf('h2'),'students/s1/medicalProfile/main'), {allergies:[]}));
  await assertFails(updateDoc(doc(dbOf('h1'),'students/s1'), {therapistIds:['h2']}));
  await assertFails(deleteDoc(doc(dbOf('a1'),'students/s1')));
  await assertFails(deleteDoc(doc(dbOf('a1'),'students/s1/medicalProfile/main')));
  await assertFails(deleteDoc(doc(dbOf('a1'),'students/s1/carePlan/main')));
  await assertFails(deleteDoc(doc(dbOf('a1'),'staff/staff')));
  await assertFails(setDoc(doc(dbOf('h2'),'teletherapySessions/new'), {...linked, therapistId:'h2'}));
});

test('caregivers see only linked children and stay read-only on clinical records', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const uid of ['g1', 'g2']) batch.set(doc(db, 'users', uid), { uid, role: 'caregiver', centerId: 'c1', status: 'approved' });
    batch.set(doc(db, 'students/s3'), { ...child, caregiverIds: ['g1'] });
    batch.set(doc(db, 'dailyCareJournals/j3'), { studentId: 's3', centerId: 'c1', parentId: 'p1', date: '2026-11-21' });
    await batch.commit();
  });
  const g1 = dbOf('g1');
  await assertSucceeds(getDoc(doc(g1, 'students/s3')));
  await assertSucceeds(getDocs(query(collection(g1, 'students'), where('centerId', '==', 'c1'), where('caregiverIds', 'array-contains', 'g1'))));
  await assertSucceeds(getDocs(query(collection(g1, 'dailyCareJournals'), where('studentId', '==', 's3'), where('centerId', '==', 'c1'))));
  await assertFails(getDoc(doc(g1, 'students/s1')));
  await assertFails(getDocs(query(collection(g1, 'dailyCareJournals'), where('centerId', '==', 'c1'))));
  await assertFails(setDoc(doc(g1, 'dailyCareJournals/2026-11-22_s3'), { studentId: 's3', centerId: 'c1', parentId: 'p1' }));
  await assertFails(updateDoc(doc(g1, 'students/s3'), { caregiverIds: ['g1', 'g2'] }));
  await assertFails(getDoc(doc(dbOf('g2'), 'students/s3')));
  // Only an admin may link caregivers, and only to approved caregiver accounts.
  await assertFails(updateDoc(doc(dbOf('a1'), 'students/s3'), { caregiverIds: ['t1'] }));
  await assertSucceeds(updateDoc(doc(dbOf('a1'), 'students/s3'), { caregiverIds: ['g1', 'g2'] }));
  await assertSucceeds(getDoc(doc(dbOf('g2'), 'students/s3')));
  await assertSucceeds(setDoc(doc(dbOf('newcg'), 'users/newcg'), { uid: 'newcg', role: 'caregiver', status: 'pending', centerId: 'c1' }));
});

test('care-team messages are append-only and limited to the child\'s team', async () => {
  const message = (sender, role) => ({ ...linked, senderId: sender, senderName: 'Synthetic', senderRole: role, text: 'Synthetic message', createdAt: serverTimestamp() });
  await assertSucceeds(setDoc(doc(dbOf('p1'), 'careMessages/m1'), message('p1', 'parent')));
  await assertSucceeds(setDoc(doc(dbOf('h1'), 'careMessages/m2'), message('h1', 'therapist')));
  await assertFails(setDoc(doc(dbOf('p1'), 'careMessages/forged'), message('h1', 'therapist')));
  await assertFails(setDoc(doc(dbOf('p1'), 'careMessages/role'), message('p1', 'admin')));
  await assertFails(setDoc(doc(dbOf('p2'), 'careMessages/outsider'), message('p2', 'parent')));
  await assertFails(setDoc(doc(dbOf('p1'), 'careMessages/long'), { ...message('p1', 'parent'), text: 'x'.repeat(2001) }));
  await assertSucceeds(getDocs(query(collection(dbOf('p1'), 'careMessages'), where('studentId', '==', 's1'), where('parentId', '==', 'p1'))));
  await assertSucceeds(getDocs(query(collection(dbOf('t1'), 'careMessages'), where('studentId', '==', 's1'), where('centerId', '==', 'c1'))));
  await assertFails(getDocs(query(collection(dbOf('p2'), 'careMessages'), where('studentId', '==', 's1'), where('parentId', '==', 'p2'))));
  await assertFails(updateDoc(doc(dbOf('p1'), 'careMessages/m1'), { text: 'edited' }));
  await assertFails(deleteDoc(doc(dbOf('a1'), 'careMessages/m1')));
});

test('documents are server-written; audit log is append-only and admin-read; reminders are server-only', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'studentDocuments/d1'), { ...linked, title: 'Synthetic', fileName: 'a.pdf' });
  });
  await assertSucceeds(getDoc(doc(dbOf('p1'), 'studentDocuments/d1')));
  await assertFails(getDoc(doc(dbOf('p2'), 'studentDocuments/d1')));
  for (const uid of ['a1', 'h1', 'p1']) await assertFails(setDoc(doc(dbOf(uid), 'studentDocuments/forged'), { ...linked, title: 'x' }));

  const entry = (uid, role) => ({ centerId: 'c1', actorUid: uid, actorName: 'Synthetic', actorRole: role, action: 'test.write', targetType: 'test', targetId: 'x', studentId: 's1', summary: 'Synthetic audit entry', source: 'web', at: serverTimestamp() });
  await assertSucceeds(setDoc(doc(dbOf('t1'), 'auditLogs/e1'), entry('t1', 'teacher')));
  await assertFails(setDoc(doc(dbOf('t1'), 'auditLogs/forged'), entry('h1', 'therapist')));
  await assertFails(setDoc(doc(dbOf('t1'), 'auditLogs/role'), entry('t1', 'admin')));
  await assertFails(setDoc(doc(dbOf('t1'), 'auditLogs/source'), { ...entry('t1', 'teacher'), source: 'api' }));
  await assertSucceeds(getDocs(query(collection(dbOf('a1'), 'auditLogs'), where('centerId', '==', 'c1'))));
  await assertFails(getDocs(query(collection(dbOf('t1'), 'auditLogs'), where('centerId', '==', 'c1'))));
  await assertFails(getDocs(query(collection(dbOf('a2'), 'auditLogs'), where('centerId', '==', 'c1'))));
  await assertFails(updateDoc(doc(dbOf('a1'), 'auditLogs/e1'), { summary: 'rewritten' }));
  await assertFails(deleteDoc(doc(dbOf('a1'), 'auditLogs/e1')));

  await assertFails(getDoc(doc(dbOf('a1'), 'appointmentReminders/any')));
  await assertFails(setDoc(doc(dbOf('a1'), 'appointmentReminders/any'), { sent: true }));
});
