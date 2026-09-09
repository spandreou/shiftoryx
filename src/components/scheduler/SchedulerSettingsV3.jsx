import { useEffect, useState } from 'react';
import { calculateShiftDurationHoursV3, validateSchedulerConfigV3, applySimpleRotationV3 } from '../../scheduler-engine-v3/index.ts';
import QuarterHourTimePicker from './QuarterHourTimePicker';

const days={MONDAY:'Δευτέρα',TUESDAY:'Τρίτη',WEDNESDAY:'Τετάρτη',THURSDAY:'Πέμπτη',FRIDAY:'Παρασκευή',SATURDAY:'Σάββατο',SUNDAY:'Κυριακή'};
const button='rounded border border-slate-400 px-3 py-2 text-sm disabled:opacity-50';
export default function SchedulerSettingsV3({ config, employees, onSave, busy=false }) {
  const [draft,setDraft]=useState(()=>structuredClone(config));
  const [profiles,setProfiles]=useState(()=>structuredClone(employees));
  useEffect(()=>setProfiles(previous=>employees.map(employee=>{
    const pending=previous.find(p=>p.id===employee.id);
    return {...employee,schedulerV3:pending?.schedulerV3||structuredClone(employee.schedulerV3)};
  })),[employees]);
  const validation=validateSchedulerConfigV3(draft);
  const updateDay=(index,patch)=>setDraft(c=>({...c,operatingDays:c.operatingDays.map((d,n)=>n===index?{...d,...patch}:d)}));
  const updateTemplate=(index,patch)=>setDraft(c=>({...c,shiftTemplates:c.shiftTemplates.map((t,n)=>{if(n!==index)return t;const next={...t,...patch};return {...next,durationHours:calculateShiftDurationHoursV3(next.startTime,next.endTime,next.crossMidnight)};})}));
  const updateProfile=(index,patch)=>setProfiles(list=>list.map((e,n)=>n===index?{...e,schedulerV3:applySimpleRotationV3({...e.schedulerV3,...patch},draft.shiftTemplates).profile}:e));
  const rotationResults=profiles.map(e=>applySimpleRotationV3(e.schedulerV3,draft.shiftTemplates));
  return <form onSubmit={e=>{e.preventDefault();if(validation.valid)onSave(draft,profiles.map((p,n)=>({...p,schedulerV3:rotationResults[n].profile})));}} className="space-y-5" aria-label="Ρυθμίσεις προγράμματος V3">
    <fieldset disabled={busy} className="space-y-5">
    <legend className="text-lg font-bold">Ρυθμίσεις προγράμματος</legend>
    <div className="grid gap-3 sm:grid-cols-2">{draft.operatingDays.map((day,index)=><fieldset className="rounded border border-slate-500 p-3 space-y-2" key={day.weekday}><legend>{days[day.weekday]}</legend>
      <label><input type="checkbox" checked={day.isOpen} onChange={e=>updateDay(index,{isOpen:e.target.checked})}/> Ανοιχτά</label>
      {day.windows.map((w,n)=><div key={n} className="flex flex-wrap items-end gap-2">
        <QuarterHourTimePicker label={`${days[day.weekday]} ${n+1} από`} value={w.openTime} onChange={openTime=>updateDay(index,{windows:day.windows.map((x,j)=>j===n?{...x,openTime}:x)})}/>
        <QuarterHourTimePicker label={`${days[day.weekday]} ${n+1} έως`} value={w.closeTime} onChange={closeTime=>updateDay(index,{windows:day.windows.map((x,j)=>j===n?{...x,closeTime}:x)})}/>
        <label><input type="checkbox" checked={Boolean(w.crossMidnight)} onChange={e=>updateDay(index,{windows:day.windows.map((x,j)=>j===n?{...x,crossMidnight:e.target.checked}:x)})}/> Επόμενη ημέρα</label>
        <button type="button" className={button} aria-label={`Αφαίρεση ωραρίου ${days[day.weekday]} ${n+1}`} onClick={()=>updateDay(index,{windows:day.windows.filter((_,j)=>j!==n)})}>Αφαίρεση</button>
      </div>)}<button type="button" className={button} onClick={()=>updateDay(index,{windows:[...day.windows,{openTime:'08:00',closeTime:'16:00',crossMidnight:false}]})}>Προσθήκη ωραρίου</button>
    </fieldset>)}</div>
    <h3 className="font-bold">Πρότυπα βαρδιών</h3>
    {draft.shiftTemplates.map((t,index)=><fieldset key={t.id} className="flex flex-wrap items-end gap-3 rounded border border-slate-500 p-3"><legend>{t.label}</legend>
      <label>Όνομα<input className="input-glass block rounded p-2" value={t.label} onChange={e=>updateTemplate(index,{label:e.target.value})}/></label>
      <QuarterHourTimePicker label="Έναρξη βάρδιας" value={t.startTime} onChange={startTime=>updateTemplate(index,{startTime})}/><QuarterHourTimePicker label="Λήξη βάρδιας" value={t.endTime} onChange={endTime=>updateTemplate(index,{endTime})}/>
      <label><input type="checkbox" checked={t.crossMidnight} onChange={e=>updateTemplate(index,{crossMidnight:e.target.checked})}/> Επόμενη ημέρα</label>
      <label><input type="checkbox" checked={t.isActive} onChange={e=>updateTemplate(index,{isActive:e.target.checked})}/> Ενεργή</label>
      <label>Τύπος<select className="input-glass block rounded p-2" value={t.shiftType} onChange={e=>updateTemplate(index,{shiftType:e.target.value})}>{['MORNING','INTERMEDIATE','AFTERNOON','NIGHT','CUSTOM'].map(v=><option key={v}>{v}</option>)}</select></label>
      <span>{t.durationHours} ώρες</span><button type="button" className={button} onClick={()=>setDraft(c=>({...c,shiftTemplates:c.shiftTemplates.filter(x=>x.id!==t.id),coverageRequirements:c.coverageRequirements.map(p=>({...p,slots:p.slots.filter(s=>s.shiftTemplateId!==t.id)}))}))}>Διαγραφή {t.label}</button>
    </fieldset>)}
    <button type="button" className={button} onClick={()=>setDraft(c=>({...c,shiftTemplates:[...c.shiftTemplates,{id:crypto.randomUUID(),label:'Νέα βάρδια',shortCode:'ΝΕΑ',shiftType:'CUSTOM',startTime:'08:00',endTime:'16:00',durationHours:8,crossMidnight:false,isActive:true}]}))}>Προσθήκη βάρδιας</button>
    <h3 className="font-bold">Άτομα ανά βάρδια</h3>
    {draft.operatingDays.map(day=><fieldset key={day.weekday} className="flex flex-wrap gap-3"><legend>{days[day.weekday]}</legend>{draft.shiftTemplates.map(t=><label key={t.id}>{t.label}<input className="input-glass block w-24 rounded p-2" type="number" min="0" max="100" value={draft.coverageRequirements.find(p=>p.weekday===day.weekday)?.slots.find(s=>s.shiftTemplateId===t.id)?.headcount??0} onChange={e=>setDraft(c=>{const current=c.coverageRequirements.find(p=>p.weekday===day.weekday)||{weekday:day.weekday,slots:[]};return {...c,coverageRequirements:[...c.coverageRequirements.filter(p=>p.weekday!==day.weekday),{...current,slots:[...current.slots.filter(s=>s.shiftTemplateId!==t.id),{shiftTemplateId:t.id,headcount:Number(e.target.value)}]}]};})}/></label>)}</fieldset>)}
    <h3 className="font-bold">Στόχοι και προειδοποιήσεις</h3>
    <label className="block"><input type="checkbox" checked={draft.generationDefaults.balanceWeeklyTargetsForMonth} onChange={e=>setDraft(c=>({...c,generationDefaults:{balanceWeeklyTargetsForMonth:e.target.checked}}))}/> Εξισορρόπηση εβδομαδιαίων στόχων στη δημιουργία</label>
    <div className="grid gap-3 sm:grid-cols-2">{[['minRestIntervalHours','Ελάχιστες ώρες ανάπαυσης'],['maxDailyHours','Προειδοποίηση ημερήσιων ωρών'],['maxWeeklyHours','Προειδοποίηση εβδομαδιαίων ωρών'],['maxConsecutiveWorkingDays','Προειδοποίηση συνεχόμενων ημερών']].map(([key,label])=><label key={key}>{label}<input className="input-glass block w-28 rounded p-2" type="number" min="0.25" step="0.25" value={draft.warningPolicies?.[key]??''} onChange={e=>setDraft(c=>({...c,warningPolicies:{...c.warningPolicies,[key]:e.target.value===''?null:Number(e.target.value)}}))}/></label>)}</div>
    <h3 className="font-bold">Προφίλ εργαζομένων</h3>
    {profiles.map((e,index)=><fieldset key={e.id} className="grid gap-3 rounded border border-slate-500 p-3 sm:grid-cols-2"><legend>{e.fullName}</legend>
      <label>Συμμετοχή<select className="input-glass block rounded p-2" value={e.schedulerV3.workMode} onChange={x=>updateProfile(index,{workMode:x.target.value})}><option value="NORMAL">Κανονική</option><option value="SUBSTITUTE_ONLY">Μόνο χειροκίνητη κάλυψη</option></select></label>
      <label>Σταθερό ρεπό<select className="input-glass block rounded p-2" value={e.schedulerV3.fixedDayOff??''} onChange={x=>updateProfile(index,{fixedDayOff:x.target.value===''?null:Number(x.target.value)})}><option value="">Χωρίς</option>{['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'].map((d,n)=><option value={n} key={n}>{d}</option>)}</select></label>
      <label>Στόχος εβδομαδιαίων ωρών<input className="input-glass block w-28 rounded p-2" type="number" min="0" max="168" step="0.25" value={e.schedulerV3.targetWeeklyHours??''} onChange={x=>updateProfile(index,{targetWeeklyHours:x.target.value===''?null:Number(x.target.value)})}/></label>
      <label>Τυπική βάρδια<select className="input-glass block rounded p-2" value={e.schedulerV3.standardShiftTemplateId??''} onChange={x=>updateProfile(index,{standardShiftTemplateId:x.target.value||null})}><option value="">Χωρίς</option>{draft.shiftTemplates.filter(t=>t.isActive).map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>
      <label><input type="checkbox" checked={e.schedulerV3.rotateStandardShiftWeekly} onChange={x=>updateProfile(index,{rotateStandardShiftWeekly:x.target.checked})}/> Αλλαγή βάρδιας κάθε εβδομάδα</label>
      {rotationResults[index].warning&&<p role="status">{rotationResults[index].warning}</p>}
    </fieldset>)}
    {!validation.valid&&<div role="alert">{validation.errors.join(' ')}</div>}
    <button className={button} disabled={!validation.valid}>Αποθήκευση ρυθμίσεων</button>
    </fieldset>
  </form>;
}
