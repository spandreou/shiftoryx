import { useEffect, useState } from 'react';
import { calculateShiftDurationHoursV3, validateSchedulerConfigV3, applySimpleRotationV3, decodeEmployeeProfileV3, normalizeEmployeeProfileV3, validateEmployeeProfileV3 } from '../../scheduler-engine-v3/index.ts';
import QuarterHourTimePicker from './QuarterHourTimePicker';

const days={MONDAY:'Δευτέρα',TUESDAY:'Τρίτη',WEDNESDAY:'Τετάρτη',THURSDAY:'Πέμπτη',FRIDAY:'Παρασκευή',SATURDAY:'Σάββατο',SUNDAY:'Κυριακή'};
const button='rounded border border-slate-400 px-3 py-2 text-sm disabled:opacity-50';
export default function SchedulerSettingsV3({config,employees,onSave,busy=false}) {
  const decode=employee=>{const result=decodeEmployeeProfileV3(employee.schedulerV3,config.shiftTemplates);return {...employee,schedulerV3:result.profile,diagnostics:result.diagnostics};};
  const [draft,setDraft]=useState(()=>structuredClone(config));
  const [profiles,setProfiles]=useState(()=>employees.map(decode));
  const [selectedId,setSelectedId]=useState('');
  const [dirtyIds,setDirtyIds]=useState(()=>new Set());
  useEffect(()=>setProfiles(previous=>employees.map(employee=>{
    const pending=previous.find(p=>p.id===employee.id);
    return dirtyIds.has(employee.id)&&pending?{...employee,schedulerV3:pending.schedulerV3,diagnostics:pending.diagnostics}:decode(employee);
  })),[employees,config,dirtyIds]);
  const active=profiles.filter(e=>e.isActive!==false);
  const selected=active.find(e=>e.id===selectedId)||active[0];
  const p=selected?.schedulerV3;
  const validation=validateSchedulerConfigV3(draft);
  const rotationResults=profiles.map(e=>e.schedulerV3?applySimpleRotationV3(e.schedulerV3,draft.shiftTemplates):null);
  const profileErrors=profiles.flatMap((e,n)=>e.schedulerV3?[...validateEmployeeProfileV3(e.schedulerV3).errors,...(rotationResults[n]?.warning?[rotationResults[n].warning]:[])]:e.diagnostics);
  const rotationPreview=p?applySimpleRotationV3({...p,rotateStandardShiftWeekly:true},draft.shiftTemplates):null;
  const valid=validation.valid&&profileErrors.length===0;
  const updateDay=(index,patch)=>setDraft(c=>({...c,operatingDays:c.operatingDays.map((d,n)=>n===index?{...d,...patch}:d)}));
  const updateTemplate=(index,patch)=>setDraft(c=>({...c,shiftTemplates:c.shiftTemplates.map((t,n)=>{if(n!==index)return t;const next={...t,...patch};return {...next,durationHours:calculateShiftDurationHoursV3(next.startTime,next.endTime,next.crossMidnight)};})}));
  const updateProfile=patch=>{
    if(!selected)return;
    setDirtyIds(ids=>new Set(ids).add(selected.id));
    setProfiles(list=>list.map(e=>e.id===selected.id?{...e,schedulerV3:applySimpleRotationV3({...e.schedulerV3,...patch},draft.shiftTemplates).profile,diagnostics:[]}:e));
  };
  return <form onSubmit={async event=>{
    event.preventDefault();if(!valid)return;
    const saved=await onSave(draft,profiles.map((employee,n)=>({...employee,schedulerV3:rotationResults[n].profile})));
    if(saved===true)setDirtyIds(new Set());
  }} className="space-y-5" aria-label="Ρυθμίσεις προγράμματος V3">
    <fieldset disabled={busy} className="space-y-4">
      <legend className="text-lg font-bold">Ρυθμίσεις προγράμματος</legend>
      <details className="rounded border p-3"><summary>Λειτουργία και κάλυψη καταστήματος</summary>
    <div className="grid gap-3 sm:grid-cols-2">{draft.operatingDays.map((day,index)=><fieldset className="rounded border border-slate-500 p-3 space-y-2" key={day.weekday}><legend>{days[day.weekday]}</legend>
      <label><input type="checkbox" checked={day.isOpen} onChange={e=>updateDay(index,{isOpen:e.target.checked})}/> Ανοιχτά</label>
      {day.windows.map((w,n)=><div key={n} className="flex flex-wrap items-end gap-2">
        <QuarterHourTimePicker label={`${days[day.weekday]} ${n+1} από`} value={w.openTime} onChange={openTime=>updateDay(index,{windows:day.windows.map((x,j)=>j===n?{...x,openTime}:x)})}/>
        <QuarterHourTimePicker label={`${days[day.weekday]} ${n+1} έως`} value={w.closeTime} onChange={closeTime=>updateDay(index,{windows:day.windows.map((x,j)=>j===n?{...x,closeTime}:x)})}/>
        <label><input type="checkbox" checked={Boolean(w.crossMidnight)} onChange={e=>updateDay(index,{windows:day.windows.map((x,j)=>j===n?{...x,crossMidnight:e.target.checked}:x)})}/> Επόμενη ημέρα</label>
        <button type="button" className={button} aria-label={`Αφαίρεση ωραρίου ${days[day.weekday]} ${n+1}`} onClick={()=>updateDay(index,{windows:day.windows.filter((_,j)=>j!==n)})}>Αφαίρεση</button>
      </div>)}<button type="button" className={button} onClick={()=>updateDay(index,{windows:[...day.windows,{openTime:'08:00',closeTime:'16:00',crossMidnight:false}]})}>Προσθήκη ωραρίου</button>
    </fieldset>)}</div>
    <h3 className="font-bold">Ωράρια κάλυψης</h3>
    {draft.shiftTemplates.map((t,index)=><fieldset key={t.id} className="flex flex-wrap items-end gap-3 rounded border border-slate-500 p-3"><legend>{t.label}</legend>
      <label>Όνομα<input className="input-glass block rounded p-2" value={t.label} onChange={e=>updateTemplate(index,{label:e.target.value})}/></label>
      <QuarterHourTimePicker label="Έναρξη βάρδιας" value={t.startTime} onChange={startTime=>updateTemplate(index,{startTime})}/><QuarterHourTimePicker label="Λήξη βάρδιας" value={t.endTime} onChange={endTime=>updateTemplate(index,{endTime})}/>
      <label><input type="checkbox" checked={t.crossMidnight} onChange={e=>updateTemplate(index,{crossMidnight:e.target.checked})}/> Επόμενη ημέρα</label>
      <label><input type="checkbox" checked={t.isActive} onChange={e=>updateTemplate(index,{isActive:e.target.checked})}/> Ενεργή</label>
      <label>Τύπος<select className="input-glass block rounded p-2" value={t.shiftType} onChange={e=>updateTemplate(index,{shiftType:e.target.value})}>{[['MORNING','Πρωινό'],['INTERMEDIATE','Ημερήσιο'],['AFTERNOON','Απογευματινό'],['NIGHT','Νυχτερινό'],['CUSTOM','Προσαρμοσμένο']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <span>{t.durationHours} ώρες</span><button type="button" className={button} onClick={()=>setDraft(c=>({...c,shiftTemplates:c.shiftTemplates.filter(x=>x.id!==t.id),coverageRequirements:c.coverageRequirements.map(p=>({...p,slots:p.slots.filter(s=>s.shiftTemplateId!==t.id)}))}))}>Διαγραφή {t.label}</button>
    </fieldset>)}
    <button type="button" className={button} onClick={()=>setDraft(c=>({...c,shiftTemplates:[...c.shiftTemplates,{id:crypto.randomUUID(),label:'Νέα βάρδια',shortCode:'ΝΕΑ',shiftType:'CUSTOM',startTime:'08:00',endTime:'16:00',durationHours:8,crossMidnight:false,isActive:true}]}))}>Προσθήκη βάρδιας</button>
    <h3 className="font-bold">Άτομα ανά βάρδια</h3>
    {draft.operatingDays.map(day=><fieldset key={day.weekday} className="flex flex-wrap gap-3"><legend>{days[day.weekday]}</legend>{draft.shiftTemplates.map(t=><label key={t.id}>{t.label}<input className="input-glass block w-24 rounded p-2" type="number" min="0" max="100" value={draft.coverageRequirements.find(p=>p.weekday===day.weekday)?.slots.find(s=>s.shiftTemplateId===t.id)?.headcount??0} onChange={e=>setDraft(c=>{const current=c.coverageRequirements.find(p=>p.weekday===day.weekday)||{weekday:day.weekday,slots:[]};return {...c,coverageRequirements:[...c.coverageRequirements.filter(p=>p.weekday!==day.weekday),{...current,slots:[...current.slots.filter(s=>s.shiftTemplateId!==t.id),{shiftTemplateId:t.id,headcount:Number(e.target.value)}]}]};})}/></label>)}</fieldset>)}
    <h3 className="font-bold">Στόχοι και προειδοποιήσεις</h3>
    <label className="block"><input type="checkbox" checked={draft.generationDefaults.balanceWeeklyTargetsForMonth} onChange={e=>setDraft(c=>({...c,generationDefaults:{balanceWeeklyTargetsForMonth:e.target.checked}}))}/> Εξισορρόπηση εβδομαδιαίων στόχων στη δημιουργία</label>
    <div className="grid gap-3 sm:grid-cols-2">{[['minRestIntervalHours','Ελάχιστες ώρες ανάπαυσης'],['maxDailyHours','Προειδοποίηση ημερήσιων ωρών'],['maxWeeklyHours','Προειδοποίηση εβδομαδιαίων ωρών'],['maxConsecutiveWorkingDays','Προειδοποίηση συνεχόμενων ημερών']].map(([key,label])=><label key={key}>{label}<input className="input-glass block w-28 rounded p-2" type="number" min="0.25" step="0.25" value={draft.warningPolicies?.[key]??''} onChange={e=>setDraft(c=>({...c,warningPolicies:{...c.warningPolicies,[key]:e.target.value===''?null:Number(e.target.value)}}))}/></label>)}</div>

      </details>
      <h3 className="font-bold">Προφίλ εργαζομένου</h3>
      <label className="block">Εργαζόμενος<select aria-label="Εργαζόμενος" className="input-glass block w-full rounded p-2" value={selected?.id||''} onChange={event=>setSelectedId(event.target.value)} disabled={!active.length}>
        {!active.length&&<option value="">Δεν υπάρχουν ενεργοί εργαζόμενοι</option>}
        {active.map(e=><option key={e.id} value={e.id}>{e.fullName}</option>)}
      </select></label>
      {selected&&!p&&<div role="alert"><p>{selected.diagnostics.join(' ')}</p><button type="button" className={button} onClick={()=>updateProfile(normalizeEmployeeProfileV3())}>Δημιουργία νέου προφίλ για έλεγχο</button></div>}
      {p&&<div className="grid gap-4 rounded border p-3 sm:grid-cols-2">
        <QuarterHourTimePicker label="Τυπική έναρξη" value={p.standardShift?.startTime||''} onChange={startTime=>updateProfile({standardShift:{startTime,endTime:p.standardShift?.endTime||'14:00'}})}/>
        <QuarterHourTimePicker label="Τυπική λήξη" value={p.standardShift?.endTime||''} onChange={endTime=>updateProfile({standardShift:{startTime:p.standardShift?.startTime||'06:00',endTime}})}/>
        <button type="button" className={button} onClick={()=>updateProfile({standardShift:null,rotateStandardShiftWeekly:false,rotationAlternateShift:null})}>Χωρίς τυπικό ωράριο</button>
        {p.standardShift&&p.standardShift.endTime<p.standardShift.startTime&&<p>Λήξη την επόμενη ημέρα</p>}
        <label>Σταθερό ρεπό<select aria-label="Σταθερό ρεπό" className="input-glass block w-full rounded p-2" value={p.fixedDayOff??''} onChange={event=>updateProfile({fixedDayOff:event.target.value===''?null:Number(event.target.value)})}>
          <option value="">Χωρίς σταθερό ρεπό</option>{[[1,'Δευτέρα'],[2,'Τρίτη'],[3,'Τετάρτη'],[4,'Πέμπτη'],[5,'Παρασκευή'],[6,'Σάββατο'],[0,'Κυριακή']].map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="sm:col-span-2"><input type="checkbox" checked={p.rotateStandardShiftWeekly} disabled={!p.rotateStandardShiftWeekly&&!!rotationPreview?.warning} onChange={event=>updateProfile({rotateStandardShiftWeekly:event.target.checked})}/> Αλλαγή βάρδιας κάθε εβδομάδα</label>
        {rotationPreview?.warning?<p role="status" className="sm:col-span-2">{rotationPreview.warning}</p>:rotationPreview?.profile.rotationAlternateShift&&<p className="sm:col-span-2">Εναλλακτικό ωράριο: {rotationPreview.profile.rotationAlternateShift.startTime}–{rotationPreview.profile.rotationAlternateShift.endTime}</p>}
        <label>Στόχος εβδομαδιαίων ωρών<input className="input-glass block w-full rounded p-2" type="number" min="0" max="168" step="0.25" value={p.targetWeeklyHours??''} onChange={event=>updateProfile({targetWeeklyHours:event.target.value===''?null:Number(event.target.value)})}/></label>
        <label>Συμμετοχή<select aria-label="Συμμετοχή" className="input-glass block w-full rounded p-2" value={p.workMode} onChange={event=>updateProfile({workMode:event.target.value})}>
          <option value="NORMAL">Κανονική συμμετοχή</option><option value="SUBSTITUTE_ONLY">Μόνο για κάλυψη / αντικατάσταση</option>
        </select></label>
      </div>}
      {!valid&&<p role="alert">{[...validation.errors,...profileErrors].join(' ')}</p>}
      <button className={button} disabled={!valid}>Αποθήκευση ρυθμίσεων</button>
    </fieldset>
  </form>;
}
