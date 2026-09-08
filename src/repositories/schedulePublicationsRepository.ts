import { collection, doc, getDoc, getDocs, query, where, runTransaction, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { db, auth, storage } from '../firebase/config';
import { normalizeTenantId } from '../utils/tenantDataPaths';
import { analyzeDraftV3, type DraftV3 } from '../services/schedulerV3Service.ts';
import { projectionTargetsV3, projectionPayloadV3 } from '../services/publicationProjectionsV3.ts';
import { validateSchedulerConfigV3, validateEmployeeProfileV3 } from '../scheduler-engine-v3/index.ts';
import type { EmployeeV3, SchedulerConfigV3, SchedulePublicationV3 } from '../scheduler-engine-v3/types.ts';

const clean = (data: unknown) => JSON.parse(JSON.stringify(data));
function context(tenantId:string) {
  if (import.meta.env.VITE_ENABLE_SCHEDULER_V3 !== 'true') throw new Error('Το Scheduler V3 είναι απενεργοποιημένο.');
  const tenant=normalizeTenantId(tenantId);
  if(!db||!auth?.currentUser||!storage)throw new Error('Απαιτείται σύνδεση OWNER.');
  return { tenant, uid:auth.currentUser.uid, root:`tenants/${tenant}` };
}
const idCheck=(id:string)=>{if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))throw new Error('Μη έγκυρο αναγνωριστικό.');return id;};
export const schedulePublicationsRepository={
  async setEmployeeActive(tenantId:string,id:string,isActive:boolean) {
    const c=context(tenantId);const batch=writeBatch(db);
    batch.update(doc(db,c.root,'employees',idCheck(id)),{isActive});
    await batch.commit();
  },
  async saveSettings(config:SchedulerConfigV3,employees:EmployeeV3[]) {
    const c=context(config.tenantId);
    if(!validateSchedulerConfigV3(config).valid||employees.length>100)throw new Error('Μη έγκυρες ρυθμίσεις.');
    const batch=writeBatch(db); const ids=new Set(config.shiftTemplates.map(t=>t.id));
    for(const employee of employees) {
      if(!validateEmployeeProfileV3(employee.schedulerV3,ids).valid)throw new Error('Μη έγκυρο προφίλ.');
      batch.update(doc(db,c.root,'employees',idCheck(employee.id)),{schedulerV3:clean(employee.schedulerV3)});
    }
    batch.set(doc(db,c.root,'settings','scheduler'),{schedulerSchemaVersion:3,schedulerConfigV3:clean(config)},{merge:true});
    await batch.commit();
  },
  async saveDraft(draft:DraftV3) {
    analyzeDraftV3(draft); const c=context(draft.config.tenantId);idCheck(draft.id);
    return runTransaction(db,async tx=>{
      const metadata=doc(db,c.root,'scheduleDrafts',draft.id);const previous=await tx.get(metadata);
      const prior=previous.data();
      if((prior?.revision||0)!==(draft.revision||0))throw new Error('Το προσχέδιο άλλαξε αλλού. Επαναφόρτωσέ το πριν την αποθήκευση.');
      const previousIds:string[]=prior?.shiftDocumentIds||[];
      const shiftDocumentIds=draft.shifts.map((_,n)=>`${draft.id}_${n}`);
      const removedIds=previousIds.filter(id=>!shiftDocumentIds.includes(id));
      if(removedIds.length+draft.shifts.length+1>450)throw new Error('Το προσχέδιο υπερβαίνει το όριο ατομικής αποθήκευσης. Χρησιμοποίησε μικρότερη περίοδο.');
      removedIds.forEach(id=>tx.delete(doc(db,c.root,'shifts',idCheck(id))));
      draft.shifts.forEach((s,n)=>tx.set(doc(db,c.root,'shifts',shiftDocumentIds[n]),clean({...s,type:'work',schedulerSchemaVersion:3,draftId:draft.id})));
      const revision=(draft.revision||0)+1;
      tx.set(metadata,clean({id:draft.id,tenantId:c.tenant,schemaVersion:3,periodType:draft.periodType,periodStart:draft.periodStart,periodEnd:draft.periodEnd,config:draft.config,employees:draft.employees,absences:draft.absences,options:draft.options,updatedBy:c.uid,revision,shiftDocumentIds}));
      return revision;
    });
  },
  async loadDraft(tenantId:string,id:string):Promise<DraftV3> {
    const c=context(tenantId);idCheck(id);
    return runTransaction(db,async tx=>{
      const metadata=await tx.get(doc(db,c.root,'scheduleDrafts',id));
      if(!metadata.exists())throw new Error('Το προσχέδιο δεν βρέθηκε.');
      const ids:string[]=metadata.data().shiftDocumentIds||[];
      const shifts=await Promise.all(ids.map(shiftId=>tx.get(doc(db,c.root,'shifts',idCheck(shiftId)))));
      if(shifts.some(s=>!s.exists()))throw new Error('Λείπουν δεδομένα προσχεδίου.');
      const draft={...metadata.data(),id,shifts:shifts.map(d=>d.data())} as DraftV3;
      if(draft.config.tenantId!==c.tenant)throw new Error('Μη έγκυρο κατάστημα.');
      analyzeDraftV3(draft);return draft;
    });
  },
  async listDrafts(tenantId:string) {const c=context(tenantId);return (await getDocs(collection(db,c.root,'scheduleDrafts'))).docs.map(d=>({id:d.id,...d.data()}));},
  async reserve(tenantId:string,periodKey:string,id:string) {
    const c=context(tenantId);idCheck(id);idCheck(periodKey);
    return runTransaction(db,async tx=>{
      const counter=doc(db,c.root,'schedulePublicationCounters',periodKey), reservation=doc(db,c.root,'schedulePublicationReservations',id);
      const [prior,count]=await Promise.all([tx.get(reservation),tx.get(counter)]);
      if(prior.exists()) {if(prior.data().periodKey!==periodKey)throw new Error('Σύγκρουση δημοσίευσης.');return prior.data().version;}
      const version=(count.data()?.version||0)+1;
      tx.set(counter,{tenantId:c.tenant,version,lastReservedId:id});tx.set(reservation,{tenantId:c.tenant,periodKey,version,publishedByUid:c.uid});return version;
    });
  },
  async uploadPdf(tenantId:string,path:string,bytes:Uint8Array) {
    const c=context(tenantId);if(!path.startsWith(c.root+'/schedule-publications/')||!path.endsWith('/schedule.pdf'))throw new Error('Μη έγκυρη διαδρομή PDF.');
    await uploadBytes(ref(storage,path),bytes,{contentType:'application/pdf'});
  },
  async finalize(snapshot:SchedulePublicationV3) {
    const c=context(snapshot.tenantId);idCheck(snapshot.id);idCheck(snapshot.periodKey);
    await runTransaction(db,async tx=>{
      const publication=doc(db,c.root,'schedulePublications',snapshot.id),index=doc(db,c.root,'schedulePublicationPeriods',snapshot.periodKey);
    const targets=projectionTargetsV3(snapshot);
    const [prior,latest,...projections]=await Promise.all([tx.get(publication),tx.get(index),...targets.map(t=>tx.get(doc(db,c.root,t.collection,t.id)))]);
      if(prior.exists())throw new Error('Η έκδοση έχει ήδη δημοσιευτεί.');
      tx.set(publication,clean(snapshot));
      if((latest.data()?.latestVersion||0)<snapshot.version) {
        tx.set(index,{tenantId:c.tenant,periodKey:snapshot.periodKey,latestVersion:snapshot.version,latestPublicationId:snapshot.id,updatedAt:snapshot.publishedAt});
        targets.forEach((target,n)=>tx.set(doc(db,c.root,target.collection,target.id),projectionPayloadV3(snapshot,target,projections[n].data())));
      }
    });
  },
  async list(tenantId:string) {const c=context(tenantId);return (await getDocs(collection(db,c.root,'schedulePublications'))).docs.map(d=>d.data() as SchedulePublicationV3).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));},
  async download(tenantId:string,publicationId:string) {const c=context(tenantId);idCheck(publicationId);return getBytes(ref(storage,`${c.root}/schedule-publications/${publicationId}/schedule.pdf`),10*1024*1024);},
};
