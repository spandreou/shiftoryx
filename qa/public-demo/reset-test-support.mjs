import {randomUUID,createHash} from 'node:crypto';
import {canonicalJson} from '../../src/services/publicationIntentV3.ts';
import {dbAdmin} from './test-support.mjs';
const fixturePaths=['demoPdfRequests/demo-fuel/intents','tenants/demo-fuel/auditLogs','monthly_schedule_exports'];
function fixturePath(path){
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8197'||process.env.GCLOUD_PROJECT!=='demo-shiftoryx-public'||!fixturePaths.includes(path))throw Error('Fixture path denied');
}
export function tombstone(tenant,generation,time=Date.now()-86400000,id=randomUUID()){
  return {intentId:id,tenantId:tenant,uid:`${tenant}-owner-g${generation}`,generation,publicationId:randomUUID(),
    inputHash:'0'.repeat(64),state:'INVALIDATED',invalidatedAt:time};
}
export function settled(tenant,generation,id=randomUUID()){
  const request={intentId:id,draftId:'fixture-draft',draftRevision:1,previewHash:'1'.repeat(64),acceptWarnings:true};
  return {request,inputHash:createHash('sha256').update(canonicalJson(request)).digest('hex'),tenantId:tenant,
    uid:`${tenant}-owner-g${generation}`,generation,publicationId:randomUUID(),version:1,
    periodKey:'WEEK_2026-09-28_2026-10-04',publishedAt:new Date().toISOString(),snapshotHash:'2'.repeat(64),
    rendererDigest:'3'.repeat(64),attemptId:randomUUID(),state:'CANCELLED'};
}
export async function fixtureRows(path,rows){
  fixturePath(path);
  if(!Array.isArray(rows)||rows.length>10000||rows.some(row=>!row||typeof row.id!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(row.id)||
    !row.data||typeof row.data!=='object'||Array.isArray(row.data)))throw Error('Fixture rows denied');
  for(let at=0;at<rows.length;at+=400){const batch=dbAdmin.batch();for(const row of rows.slice(at,at+400))batch.set(dbAdmin.doc(path+'/'+row.id),row.data);await batch.commit();}
}
export async function clearFixtureRows(path){
  // Fixed test-owned emulator fixture paths only; callers never use cloud credentials.
  fixturePath(path);
  for(let page=0;page<26;page++){const rows=await dbAdmin.collection(path).limit(400).get();if(rows.empty)return;
    const batch=dbAdmin.batch();rows.docs.forEach(row=>batch.delete(row.ref));await batch.commit();}
  throw Error('Fixture cleanup fuse');
}
