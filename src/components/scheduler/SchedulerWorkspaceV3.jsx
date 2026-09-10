import {useEffect,useMemo,useState} from 'react';
import {createDraftV3,analyzeDraftV3,editDraftV3,mapEmployeesV3,mapAbsencesV3,makeDefaultConfigV3,refreshDraftPeopleV3,createDraftFromPublicationV3} from '../../services/schedulerV3Service.ts';
import {publishDraftV3} from '../../services/schedulePublicationService.ts';
import {renderPublicationPdfV3} from '../../services/schedulePublicationPdf.ts';
import {schedulePublicationsRepository as repository} from '../../repositories/schedulePublicationsRepository.ts';
import {useSchedulerStore} from '../../hooks/useSchedulerStore';
import SchedulerSettingsV3 from './SchedulerSettingsV3';
import SchedulePreviewV3 from './SchedulePreviewV3';
import WarningsPanelV3 from './WarningsPanelV3';
import PublicationHistoryV3 from './PublicationHistoryV3';
import AbsencesPanel from './AbsencesPanel';

export function SchedulerSetupV3({tenantId,employees}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const savedConfig=useSchedulerStore(state=>state.schedulerConfigV3);
  const config=savedConfig?.tenantId===tenantId?savedConfig:makeDefaultConfigV3(tenantId);
  return <details className="glass-panel rounded p-4"><summary>Ρυθμίσεις νέου προγράμματος V3</summary>
    <p>Η αποθήκευση προετοιμάζει τις ρυθμίσεις χωρίς να ενεργοποιεί το νέο πρόγραμμα. Η ενεργοποίηση γίνεται ξεχωριστά μετά από έγκριση.</p>
    <SchedulerSettingsV3 config={config} employees={employees} busy={busy} onSave={async(c,e)=>{setBusy(true);try{await repository.saveSettings(c,e);setMessage('Αποθηκεύτηκαν.');return true;}catch(error){setMessage(error.message||'Η αποθήκευση απέτυχε.');return false;}finally{setBusy(false);}}}/>
    <p role="status">{message}</p>
  </details>;
}
export default function SchedulerWorkspaceV3({config,employees,absences,uid,onLogout,onOpenProfile,renderTools}) {
  const [draft,setDraft]=useState(null),[start,setStart]=useState(()=>new Date().toISOString().slice(0,10)),[periodType,setPeriodType]=useState('WEEK');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[publications,setPublications]=useState([]),[drafts,setDrafts]=useState([]),[acceptWarnings,setAcceptWarnings]=useState(false),[newName,setNewName]=useState('');
  const store=useSchedulerStore();
  const roster=useMemo(()=>{try{return {employees:mapEmployeesV3(employees,config),error:''};}catch(error){return {employees:[],error:error.message};}},[employees,config]);
  useEffect(()=>{
    if(roster.error){setMessage(roster.error);return;}
    setDraft(current=>current?refreshDraftPeopleV3(current,roster.employees,absences,config):null);
    setAcceptWarnings(false);
  },[roster,absences,config]);
  const analysis=useMemo(()=>{if(!draft)return {report:null,error:''};try{return {report:analyzeDraftV3(draft),error:''};}catch(error){return {report:null,error:error.message};}},[draft]);
  const report=analysis.report;
  const run=async fn=>{if(busy)return false;setBusy(true);setMessage('');try{const result=await fn();return result===undefined?true:result;}catch(error){setMessage(error?.message||'Η ενέργεια δεν ολοκληρώθηκε.');return false;}finally{setBusy(false);}};
  const change=shifts=>{try{setDraft(editDraftV3(draft,shifts));setAcceptWarnings(false);setMessage('');}catch(error){setMessage(error.message);}};
  const currentInputs=()=>{const current=useSchedulerStore.getState();return {current,currentConfig:current.schedulerConfigV3?.tenantId===config.tenantId?current.schedulerConfigV3:config};};
  const download=publication=>run(async()=>{
    const bytes=await repository.download(config.tenantId,publication.id),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=`schedule-${publication.periodKey}-v${publication.version}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const generate=()=>run(async()=>{
    let first=start,last;
    if(periodType==='MONTH'){first=start.slice(0,7)+'-01';const date=new Date(first+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);last=date.toISOString().slice(0,10);}
    else{const date=new Date(start+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));first=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6);last=date.toISOString().slice(0,10);}
    const {current,currentConfig}=currentInputs();
    setDraft(createDraftV3({config:currentConfig,employees:mapEmployeesV3(current.employees,currentConfig),absences:mapAbsencesV3(current.absences,first,last),periodType,periodStart:first,periodEnd:last,options:{balanceWeeklyTargets:currentConfig.generationDefaults.balanceWeeklyTargetsForMonth}},crypto.randomUUID()));
    setAcceptWarnings(false);
  });
  return <main className="mx-auto max-w-6xl space-y-5 p-4 text-slate-900 dark:text-slate-100" data-testid="scheduler-v3-workspace">
    <header className="flex justify-between gap-3"><h1 className="text-xl font-bold">Πρόγραμμα βαρδιών</h1><button onClick={onLogout}>Αποσύνδεση</button></header>
    <details><summary>Εργαζόμενοι και απουσίες</summary>
      <form className="flex flex-wrap gap-2 py-3" onSubmit={event=>{event.preventDefault();run(async()=>{if(await store.addEmployeeV3({fullName:newName})){setNewName('');setMessage('Ο εργαζόμενος προστέθηκε. Πάτησε Δημιουργία για νέο πρόγραμμα.');}else throw new Error(useSchedulerStore.getState().warningMessage||'Η προσθήκη απέτυχε.');});}}>
        <label>Ονοματεπώνυμο<input className="input-glass block rounded p-2" required maxLength={200} value={newName} onChange={event=>setNewName(event.target.value)}/></label><button disabled={busy}>Προσθήκη εργαζομένου</button>
      </form>
      {employees.map(e=><div className="flex flex-wrap gap-3 p-2" key={e.id}><span>{e.fullName}</span>
        {onOpenProfile&&<button disabled={busy} onClick={()=>onOpenProfile(e)}>Επεξεργασία στοιχείων</button>}
        <button disabled={busy} onClick={()=>run(()=>repository.setEmployeeActive(config.tenantId,e.id,e.isActive===false))}>{e.isActive===false?'Ενεργοποίηση':'Απενεργοποίηση'}</button>
      </div>)}
      <AbsencesPanel employees={employees} absences={absences} isAdmin isSaving={busy} isLoading={store.isAbsencesLoading} onCreateAbsence={store.createAbsence} onUpdateAbsence={store.updateAbsence} onCancelAbsence={store.cancelAbsence} onDeleteAbsence={store.deleteAbsence}/>
    </details>
    <details><summary>Ρυθμίσεις και προφίλ εργαζομένων</summary>
      <SchedulerSettingsV3 key={JSON.stringify(config)} config={config} employees={employees} busy={busy} onSave={(c,e)=>run(async()=>{await repository.saveSettings(c,e);setMessage('Οι ρυθμίσεις αποθηκεύτηκαν. Το ανοιχτό προσχέδιο διατηρεί τις δικές του ρυθμίσεις.');return true;})}/>
    </details>
    {(roster.error||analysis.error)&&<p role="alert">{roster.error||analysis.error}</p>}
    <fieldset disabled={busy} className="flex flex-wrap items-end gap-3"><legend>Δημιουργία προσχεδίου</legend>
      <label>Περίοδος<select className="input-glass block rounded p-2" value={periodType} onChange={event=>setPeriodType(event.target.value)}><option value="WEEK">Εβδομάδα</option><option value="MONTH">Μήνας</option></select></label>
      <label>Ημερομηνία<input className="input-glass block rounded p-2" type="date" value={start} onChange={event=>setStart(event.target.value)}/></label>
      <button className="rounded border px-3 py-2" disabled={!!roster.error||!start} onClick={generate}>Δημιουργία</button>
      <button className="rounded border px-3 py-2" onClick={()=>run(async()=>{setDrafts(await repository.listDrafts(config.tenantId));setPublications(await repository.list(config.tenantId));})}>Φόρτωση ιστορικού</button>
    </fieldset>
    <p role="status" aria-live="polite">{busy?'Επεξεργασία…':message}</p>
    {drafts.map(d=><button className="mr-2 rounded border p-2" key={d.id} disabled={busy} onClick={()=>run(async()=>{const loaded=await repository.loadDraft(config.tenantId,d.id);const {current,currentConfig}=currentInputs();setDraft(refreshDraftPeopleV3(loaded,current.employees,current.absences,currentConfig));setAcceptWarnings(false);})}>Προσχέδιο {d.periodStart}–{d.periodEnd}</button>)}
    {draft&&report&&<>
      <SchedulePreviewV3 key={draft.id} draft={draft} onChange={change} disabled={busy||!!roster.error}/>
      <section aria-label="Ώρες εργαζομένων"><h2 className="font-bold">Σύνολα</h2>{report.employeeHours.map(h=><p key={h.employeeId}>{draft.employees.find(e=>e.id===h.employeeId)?.fullName}: {h.hours} ώρες · {h.shiftCount} βάρδιες</p>)}</section>
      <details><summary>Εβδομαδιαίοι στόχοι και αποκλίσεις</summary><div className="overflow-x-auto"><table><thead><tr><th>Εργαζόμενος</th><th>Εβδομάδα</th><th>Ώρες</th><th>Στόχος</th><th>Διαφορά</th></tr></thead><tbody>{report.weeklyHours.map(h=><tr key={h.employeeId+h.weekStart}><td>{draft.employees.find(e=>e.id===h.employeeId)?.fullName}</td><td>{h.weekStart}{h.isPartialWeek?' (μερική εβδομάδα)':''}</td><td>{h.hours}</td><td>{h.targetHours??'—'}</td><td>{h.delta??'—'}</td></tr>)}</tbody></table></div></details>
      <WarningsPanelV3 warnings={report.warnings}/>
      <button disabled={busy||!!roster.error} className="rounded border px-3 py-2" onClick={()=>run(async()=>{const revision=await repository.saveDraft(draft);setDraft(d=>({...d,revision}));setMessage('Το προσχέδιο αποθηκεύτηκε.');})}>Αποθήκευση προσχεδίου</button>
      {report.warnings.length>0&&<label className="block"><input type="checkbox" checked={acceptWarnings} onChange={event=>setAcceptWarnings(event.target.checked)}/> Διάβασα τις προειδοποιήσεις και επιλέγω δημοσίευση.</label>}
      <button disabled={busy||!!roster.error||(report.warnings.length>0&&!acceptWarnings)} className="rounded bg-emerald-700 px-3 py-2 text-white" onClick={()=>run(async()=>{
        const {current,currentConfig}=currentInputs();const candidate=refreshDraftPeopleV3(draft,current.employees,current.absences,currentConfig);
        if(JSON.stringify(analyzeDraftV3(candidate).warnings)!==JSON.stringify(report.warnings)){setDraft(candidate);setAcceptWarnings(false);throw new Error('Οι προειδοποιήσεις άλλαξαν. Έλεγξέ τες πριν τη δημοσίευση.');}
        const tenantId=config.tenantId;
        const snapshot=await publishDraftV3(candidate,{tenantId,uid,id:crypto.randomUUID(),timestamp:new Date().toISOString(),acceptWarnings},{reserve:(key,id)=>repository.reserve(tenantId,key,id),renderPdf:renderPublicationPdfV3,uploadPdf:(path,bytes)=>repository.uploadPdf(tenantId,path,bytes),finalize:s=>repository.finalize(s)});
        setPublications(await repository.list(tenantId));setMessage(`Δημοσιεύτηκε η έκδοση ${snapshot.version}.`);
      })}>Δημοσίευση νέας έκδοσης</button>
    </>}
    <PublicationHistoryV3 publications={publications} onDownload={download} busy={busy} onCreateDraft={publication=>run(async()=>{const {current,currentConfig}=currentInputs();setDraft(createDraftFromPublicationV3(publication,{tenantId:config.tenantId,employees:current.employees,currentConfig,absences:current.absences}));setAcceptWarnings(false);setMessage(`Δημιουργήθηκε νέο προσχέδιο από την έκδοση ${publication.version}.`);})}/>
    {renderTools?.(draft)}
  </main>;
}
