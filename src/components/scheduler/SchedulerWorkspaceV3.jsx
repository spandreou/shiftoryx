import { useEffect, useState } from 'react';
import { createDraftV3, analyzeDraftV3, editDraftV3, mapEmployeesV3, makeDefaultConfigV3 } from '../../services/schedulerV3Service.ts';
import { refreshDraftPeopleV3 } from '../../services/schedulerV3Service.ts';
import { publishDraftV3 } from '../../services/schedulePublicationService.ts';
import { renderPublicationPdfV3 } from '../../services/schedulePublicationPdf.ts';
import { schedulePublicationsRepository as repository } from '../../repositories/schedulePublicationsRepository.ts';
import { useSchedulerStore } from '../../hooks/useSchedulerStore';
import SchedulerSettingsV3 from './SchedulerSettingsV3';
import SchedulePreviewV3 from './SchedulePreviewV3';
import WarningsPanelV3 from './WarningsPanelV3';
import PublicationHistoryV3 from './PublicationHistoryV3';
import AbsencesPanel from './AbsencesPanel';

export function SchedulerSetupV3({tenantId,employees}) {
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const config=makeDefaultConfigV3(tenantId);
  return <details className="glass-panel rounded p-4"><summary>Ρυθμίσεις νέου προγράμματος V3</summary><p>Η αποθήκευση ενεργοποιεί το νέο πρόγραμμα για αυτό το κατάστημα. Τα παλιά προγράμματα διατηρούνται.</p><SchedulerSettingsV3 config={config} employees={mapEmployeesV3(employees)} busy={busy} onSave={async(c,e)=>{setBusy(true);try{await repository.saveSettings(c,e);setMessage('Αποθηκεύτηκαν.');}catch{setMessage('Η αποθήκευση απέτυχε. Έλεγξε τις ρυθμίσεις και την πρόσβασή σου.');}finally{setBusy(false);}}}/><p role="status">{message}</p></details>;
}
export default function SchedulerWorkspaceV3({config,employees,absences,uid,onLogout}) {
  const [draft,setDraft]=useState(null),[start,setStart]=useState(()=>new Date().toISOString().slice(0,10)),[periodType,setPeriodType]=useState('WEEK'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[publications,setPublications]=useState([]),[drafts,setDrafts]=useState([]),[acceptWarnings,setAcceptWarnings]=useState(false);
  const mapped=mapEmployeesV3(employees);
  const store=useSchedulerStore();
  const [newName,setNewName]=useState('');
  useEffect(()=>{setDraft(d=>d?refreshDraftPeopleV3(d,mapEmployeesV3(employees),absences):null);setAcceptWarnings(false);},[employees,absences]);
  const report=draft?analyzeDraftV3(draft):null;
  const run=async fn=>{if(busy)return;setBusy(true);setMessage('');try{await fn();}catch(error){setMessage(error?.message||'Η ενέργεια δεν ολοκληρώθηκε.');}finally{setBusy(false);}};
  const change=shifts=>{try{setDraft(editDraftV3(draft,shifts));setAcceptWarnings(false);setMessage('');}catch(error){setMessage(error.message);}};
  const download=async publication=>run(async()=>{const bytes=await repository.download(config.tenantId,publication.id);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=`schedule-${publication.periodKey}-v${publication.version}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  return <main className="mx-auto max-w-6xl space-y-5 p-4 text-slate-900 dark:text-slate-100" data-testid="scheduler-v3-workspace">
    <header className="flex justify-between"><h1 className="text-xl font-bold">Πρόγραμμα βαρδιών</h1><button onClick={onLogout}>Αποσύνδεση</button></header>
    <details><summary>Εργαζόμενοι και απουσίες</summary>
      <form className="flex flex-wrap gap-2 py-3" onSubmit={e=>{e.preventDefault();run(async()=>{if(await store.addEmployee({fullName:newName})){setNewName('');}else throw new Error('Η προσθήκη εργαζομένου απέτυχε.');});}}><label>Ονοματεπώνυμο<input className="input-glass block rounded p-2" required value={newName} onChange={e=>setNewName(e.target.value)}/></label><button disabled={busy}>Προσθήκη εργαζομένου</button></form>
      {employees.map(e=><div className="flex gap-3 p-2" key={e.id}><span>{e.fullName}</span><button disabled={busy} onClick={()=>run(()=>repository.setEmployeeActive(config.tenantId,e.id,e.isActive===false))}>{e.isActive===false?'Ενεργοποίηση':'Απενεργοποίηση'}</button></div>)}
      <AbsencesPanel employees={employees} absences={absences} isAdmin isSaving={busy} isLoading={store.isAbsencesLoading} onCreateAbsence={store.createAbsence} onUpdateAbsence={store.updateAbsence} onCancelAbsence={store.cancelAbsence} onDeleteAbsence={store.deleteAbsence}/>
    </details>
    <details><summary>Ρυθμίσεις και προφίλ εργαζομένων</summary><SchedulerSettingsV3 key={JSON.stringify(config)} config={config} employees={mapped} busy={busy} onSave={(c,e)=>run(async()=>{await repository.saveSettings(c,e);setMessage('Οι ρυθμίσεις αποθηκεύτηκαν. Το ανοιχτό προσχέδιο διατηρεί τις δικές του ρυθμίσεις.');})}/></details>
    <fieldset disabled={busy} className="flex flex-wrap items-end gap-3"><legend>Δημιουργία προσχεδίου</legend><label>Περίοδος<select className="input-glass block rounded p-2" value={periodType} onChange={e=>setPeriodType(e.target.value)}><option value="WEEK">Εβδομάδα</option><option value="MONTH">Μήνας</option></select></label><label>Ημερομηνία<input className="input-glass block rounded p-2" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <button className="rounded border px-3 py-2" onClick={()=>run(async()=>{let first=start,last;if(periodType==='MONTH'){first=start.slice(0,7)+'-01';const d=new Date(first+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);last=d.toISOString().slice(0,10);}else{const d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));first=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);last=d.toISOString().slice(0,10);}const input={config,employees:mapped,absences:absences.filter(a=>a.status!=='CANCELLED'&&a.startDate<=last&&(a.endDate||a.startDate)>=first).map(a=>({id:a.id,employeeId:a.employeeId,type:['LEAVE','SICK'].includes(a.type)?a.type:'OTHER',startDate:a.startDate,endDate:a.endDate||a.startDate,scope:a.scope==='FULL_DAY'?'FULL_DAY':'PARTIAL_DAY'})),periodType,periodStart:first,periodEnd:last,options:{balanceWeeklyTargets:config.generationDefaults.balanceWeeklyTargetsForMonth}};setDraft(createDraftV3(input,crypto.randomUUID()));setAcceptWarnings(false);})}>Δημιουργία</button>
    <button className="rounded border px-3 py-2" onClick={()=>run(async()=>{setDrafts(await repository.listDrafts(config.tenantId));setPublications(await repository.list(config.tenantId));})}>Φόρτωση ιστορικού</button></fieldset>
    <p role="status" aria-live="polite">{busy?'Επεξεργασία…':message}</p>
    {drafts.map(d=><button className="mr-2 rounded border p-2" key={d.id} disabled={busy} onClick={()=>run(async()=>{const loaded=await repository.loadDraft(config.tenantId,d.id);setDraft(refreshDraftPeopleV3(loaded,mapEmployeesV3(useSchedulerStore.getState().employees),useSchedulerStore.getState().absences));setAcceptWarnings(false);})}>Προσχέδιο {d.periodStart}–{d.periodEnd}</button>)}
    {draft&&<><SchedulePreviewV3 draft={draft} onChange={change} disabled={busy}/><section aria-label="Ώρες εργαζομένων"><h2 className="font-bold">Σύνολα</h2>{report.employeeHours.map(h=><p key={h.employeeId}>{draft.employees.find(e=>e.id===h.employeeId)?.fullName}: {h.hours} ώρες · {h.shiftCount} βάρδιες</p>)}</section><WarningsPanelV3 warnings={report.warnings}/>
      <button disabled={busy} className="rounded border px-3 py-2" onClick={()=>run(async()=>{const revision=await repository.saveDraft(draft);setDraft(d=>({...d,revision}));setMessage('Το προσχέδιο αποθηκεύτηκε.');})}>Αποθήκευση προσχεδίου</button>
      {report.warnings.length>0&&<label className="block"><input type="checkbox" checked={acceptWarnings} onChange={e=>setAcceptWarnings(e.target.checked)}/> Διάβασα τις προειδοποιήσεις και επιλέγω δημοσίευση.</label>}
      <button disabled={busy||(report.warnings.length>0&&!acceptWarnings)} className="rounded bg-emerald-700 px-3 py-2 text-white" onClick={()=>run(async()=>{const tenantId=config.tenantId;const current=useSchedulerStore.getState();const candidate=refreshDraftPeopleV3(draft,mapEmployeesV3(current.employees),current.absences);if(JSON.stringify(analyzeDraftV3(candidate).warnings)!==JSON.stringify(report.warnings)){setDraft(candidate);setAcceptWarnings(false);throw new Error('Οι προειδοποιήσεις άλλαξαν. Έλεγξέ τες πριν τη δημοσίευση.');}const snapshot=await publishDraftV3(candidate,{tenantId,uid,id:crypto.randomUUID(),timestamp:new Date().toISOString(),acceptWarnings},{reserve:(key,id)=>repository.reserve(tenantId,key,id),renderPdf:renderPublicationPdfV3,uploadPdf:(path,bytes)=>repository.uploadPdf(tenantId,path,bytes),finalize:s=>repository.finalize(s)});setPublications(await repository.list(tenantId));setMessage(`Δημοσιεύτηκε η έκδοση ${snapshot.version}.`);})}>Δημοσίευση νέας έκδοσης</button>
    </>}
    <PublicationHistoryV3 publications={publications} onDownload={download} busy={busy}/>
  </main>;
}
