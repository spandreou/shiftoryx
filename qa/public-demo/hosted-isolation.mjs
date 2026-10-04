// Explicitly authorized hosted smoke test for the isolated public demo only.
// Usage: node qa/public-demo/hosted-isolation.mjs <external-web-config.json>
// No Admin SDK, emulator imports, credentials in output, or own-tenant resets.
import {readFile, mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, signInWithCustomToken} from 'firebase/auth';
import {getFirestore, doc, collection, getDocFromServer, getDocsFromServer, setDoc, updateDoc, deleteDoc, setLogLevel} from 'firebase/firestore';
import {getStorage, ref, getBytes, uploadBytes} from 'firebase/storage';

const project = 'shiftoryx-public-demo';
const tenants = ['demo-fuel', 'demo-cafe', 'demo-salon', 'demo-market'];
const expectedCounts = {'demo-fuel': 6, 'demo-cafe': 8, 'demo-salon': 6, 'demo-market': 9};
const functionOrigin = `https://us-central1-${project}.cloudfunctions.net`;
const runId = `hosted-smoke-${randomUUID()}`;
const clients = [];
const result = {suite: 'PUBLIC_DEMO_HOSTED_ISOLATION', project, startedAt: new Date().toISOString(), status: 'RUNNING', orderedPairs: 0, checks: [], cleanup: []};
let outputDir;
setLogLevel('silent');

function requireCondition(condition, label) {
  if (!condition) throw Object.assign(new Error(label), {safeLabel: label});
}
function pass(label, extra = {}) { result.checks.push({label, status: 'PASS', ...extra}); }
function category(error) {
  return typeof error?.code === 'string' && /^[a-z/-]+$/.test(error.code) ? error.code : 'unexpected-failure';
}
async function rpc(name, tenantId, token) {
  requireCondition(['enterPublicDemo', 'resetPublicDemo'].includes(name) && tenants.includes(tenantId), 'rpc-allowlist');
  const response = await fetch(`${functionOrigin}/${name}`, {
    method: 'POST', redirect: 'error',
    headers: {'Content-Type': 'application/json', Origin: 'https://demo.shiftoryx.gr', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify({data: {tenantId}}), signal: AbortSignal.timeout(45000),
  });
  return {status: response.status, body: await response.json()};
}
async function denied(label, fn, expected = 'permission-denied') {
  try { await fn(); }
  catch (error) {
    const observed = category(error);
    requireCondition(observed === expected, `${label}:expected-${expected}:observed-${observed}`);
    pass(label, {code: observed});
    return;
  }
  throw Object.assign(new Error('unexpected-access'), {safeLabel: `${label}:UNEXPECTED_ACCESS`});
}
async function positive(client, stage) {
  const row = await getDocFromServer(client.smokeRef);
  requireCondition(row.exists() && row.data().fullName === 'Hosted isolation smoke employee', `${client.tenant}:${stage}:own-smoke-read`);
  // Rewriting only this run's harmless employee proves writes remain authorized.
  await setDoc(client.smokeRef, client.smokeData);
  const rows = await getDocsFromServer(collection(client.db, 'tenants', client.tenant, 'employees'));
  requireCondition(rows.size === expectedCounts[client.tenant] + 1, `${client.tenant}:${stage}:own-employee-count`);
  const membership = await getDocFromServer(doc(client.db, 'tenantMemberships', `${client.auth.currentUser.uid}_${client.tenant}`));
  requireCondition(membership.data()?.status === 'ACTIVE' && membership.data()?.role === 'OWNER', `${client.tenant}:${stage}:active-owner`);
  pass(`${client.tenant}:${stage}:own-read-write-active-owner`, {employeeCount: rows.size});
}

try {
  requireCondition(process.argv[2], 'external-config-path-required');
  requireCondition(!Object.keys(process.env).some(key => /EMULATOR/i.test(key) && process.env[key]), 'emulator-environment-forbidden');
  const source = JSON.parse(await readFile(process.argv[2], 'utf8'));
  requireCondition(source.projectId === project, 'demo-project-required');
  requireCondition(source.authDomain === `${project}.firebaseapp.com`, 'demo-auth-domain-required');
  requireCondition([`${project}.firebasestorage.app`, `${project}.appspot.com`].includes(source.storageBucket), 'demo-storage-bucket-required');
  requireCondition(!source.databaseURL, 'unexpected-database-endpoint');
  const config = Object.fromEntries(['projectId', 'apiKey', 'appId', 'storageBucket', 'authDomain', 'messagingSenderId'].map(key => [key, source[key]]));
  outputDir = await mkdtemp(join(tmpdir(), 'shiftoryx-hosted-isolation-'));
  pass('demo-project-resource-and-no-emulator-guards');

  for (const tenant of tenants) {
    const entered = await rpc('enterPublicDemo', tenant);
    requireCondition(entered.status === 200 && typeof entered.body.result?.customToken === 'string', `${tenant}:entry`);
    requireCondition(entered.body.result.tenantId === tenant && entered.body.result.returnTo === `https://${tenant}.shiftoryx.gr`, `${tenant}:entry-target`);
    const app = initializeApp(config, `${runId}-${tenant}`);
    const client = {app, tenant, auth: getAuth(app), db: getFirestore(app), storage: getStorage(app)};
    clients.push(client);
    await signInWithCustomToken(client.auth, entered.body.result.customToken);
    delete entered.body.result.customToken;
    const claims = (await client.auth.currentUser.getIdTokenResult()).claims;
    requireCondition(claims.publicDemo === true && claims.demoTenant === tenant && claims.demoGeneration === 1, `${tenant}:generation-one-demo-claims`);
    const state = await getDocFromServer(doc(client.db, 'demoState', tenant));
    requireCondition(state.data()?.generation === 1 && state.data()?.resetting === false, `${tenant}:active-generation-one`);
    client.weekStart = state.data().weekStart;
    const rows = await getDocsFromServer(collection(client.db, 'tenants', tenant, 'employees'));
    requireCondition(rows.size === expectedCounts[tenant], `${tenant}:canonical-employee-count`);
    client.employee = rows.docs[0];
    client.settings = await getDocFromServer(doc(client.db, 'tenants', tenant, 'settings', 'scheduler'));
    client.absences = await getDocsFromServer(collection(client.db, 'tenants', tenant, 'absences'));
    requireCondition(client.settings.exists() && client.absences.size > 0, `${tenant}:canonical-settings-and-absences`);
    client.smokeRef = doc(client.db, 'tenants', tenant, 'employees', runId);
    requireCondition(!(await getDocFromServer(client.smokeRef)).exists(), `${tenant}:unique-smoke-id`);
    client.smokeData = {fullName: 'Hosted isolation smoke employee', isActive: false, schedulerV3: client.employee.data().schedulerV3};
    await setDoc(client.smokeRef, client.smokeData);
    client.smokeCreated = true;
    await positive(client, 'before');
  }

  for (const client of clients) {
    for (const foreign of clients.filter(other => other !== client)) {
      const label = `${client.tenant}->${foreign.tenant}`;
      const target = (name, id = runId) => doc(client.db, 'tenants', foreign.tenant, name, id);
      await denied(`${label}:tenant-read`, () => getDocFromServer(doc(client.db, 'tenants', foreign.tenant)));
      await denied(`${label}:employees-list`, () => getDocsFromServer(collection(client.db, 'tenants', foreign.tenant, 'employees')));
      await denied(`${label}:employee-existing-read`, () => getDocFromServer(target('employees', foreign.employee.id)));
      await denied(`${label}:employee-write`, () => setDoc(target('employees'), foreign.smokeData));
      await denied(`${label}:employee-profile-update`, () => updateDoc(target('employees'), {schedulerV3: {...foreign.smokeData.schedulerV3, targetWeeklyHours: 20}}));
      await denied(`${label}:settings-read`, () => getDocFromServer(target('settings', 'scheduler')));
      await denied(`${label}:settings-write`, () => setDoc(target('settings', 'scheduler'), foreign.settings.data()));
      const absence = foreign.absences.docs[0];
      await denied(`${label}:absence-read`, () => getDocFromServer(target('absences', absence.id)));
      await denied(`${label}:absence-write`, () => setDoc(target('absences', absence.id), absence.data()));
      await denied(`${label}:draft-read`, () => getDocFromServer(target('scheduleDrafts')));
      const draft = {id: runId, tenantId: foreign.tenant, schemaVersion: 3, periodType: 'WEEK', periodStart: foreign.weekStart, periodEnd: foreign.weekStart, config: foreign.settings.data().schedulerConfigV3, employees: [], absences: [], options: {}, updatedBy: client.auth.currentUser.uid, revision: 0, shiftDocumentIds: []};
      await denied(`${label}:draft-write`, () => setDoc(target('scheduleDrafts'), draft));
      for (const name of ['schedulePublications', 'schedulePublicationPeriods', 'schedulePublicationReservations', 'schedulePublicationCounters', 'weekHistory', 'monthlyScheduleArchives']) {
        await denied(`${label}:${name}-document-guess`, () => getDocFromServer(target(name)));
      }
      await denied(`${label}:publication-history-list`, () => getDocsFromServer(collection(client.db, 'tenants', foreign.tenant, 'schedulePublications')));
      await denied(`${label}:membership-read`, () => getDocFromServer(doc(client.db, 'tenantMemberships', `${foreign.auth.currentUser.uid}_${foreign.tenant}`)));
      await denied(`${label}:membership-escalation`, () => setDoc(doc(client.db, 'tenantMemberships', `${client.auth.currentUser.uid}_${foreign.tenant}`), {uid: client.auth.currentUser.uid, tenantId: foreign.tenant, role: 'OWNER', status: 'ACTIVE'}));
      const pdf = ref(client.storage, `tenants/${foreign.tenant}/schedule-publications/${runId}/schedule.pdf`);
      await denied(`${label}:pdf-getBytes`, () => getBytes(pdf), 'storage/unauthorized');
      await denied(`${label}:pdf-uploadBytes`, () => uploadBytes(pdf, new TextEncoder().encode('%PDF-hosted-isolation-smoke'), {contentType: 'application/pdf'}), 'storage/unauthorized');
      // A foreign tenant is mandatory here: this harness never resets its own tenant.
      requireCondition(client.tenant !== foreign.tenant, 'own-reset-forbidden');
      const reset = await rpc('resetPublicDemo', foreign.tenant, await client.auth.currentUser.getIdToken());
      requireCondition(reset.status === 403 && reset.body.error?.status === 'PERMISSION_DENIED', `${label}:reset-authorization-denial`);
      pass(`${label}:reset-denied`, {httpStatus: reset.status, code: reset.body.error.status});
      result.orderedPairs++;
      console.log(`PAIR_PASS ${label}`);
    }
    await positive(client, 'after');
  }
  requireCondition(result.orderedPairs === 12, 'all-twelve-ordered-pairs');
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = {label: error?.safeLabel || 'hosted-operation-failed', code: category(error)};
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    if (client.smokeCreated) {
      try {
        await deleteDoc(client.smokeRef);
        requireCondition(!(await getDocFromServer(client.smokeRef)).exists(), `${client.tenant}:smoke-delete`);
        const rows = await getDocsFromServer(collection(client.db, 'tenants', client.tenant, 'employees'));
        requireCondition(rows.size === expectedCounts[client.tenant], `${client.tenant}:cleanup-canonical-count`);
        result.cleanup.push({tenant: client.tenant, status: 'PASS', employeeCount: rows.size});
      } catch (error) {
        result.status = 'FAIL';
        result.cleanup.push({tenant: client.tenant, status: 'FAIL', code: category(error), smokeDocumentId: runId});
        process.exitCode = 1;
      }
    }
    await deleteApp(client.app);
  }
  result.completedAt = new Date().toISOString();
  result.checkCount = result.checks.length;
  result.denialCount = result.checks.filter(check => check.code).length;
  if (outputDir) await writeFile(join(outputDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({status: result.status, checks: result.checkCount, denials: result.denialCount, orderedPairs: result.orderedPairs, cleanup: result.cleanup, ...(result.failure ? {failure: result.failure} : {}), evidenceDirectory: outputDir}));
}
