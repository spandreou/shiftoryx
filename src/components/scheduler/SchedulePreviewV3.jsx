import { useState } from 'react';
import { calculateShiftDurationHoursV3, eachDateInRange } from '../../scheduler-engine-v3/index.ts';
import QuarterHourTimePicker from './QuarterHourTimePicker';

export default function SchedulePreviewV3({draft,onChange,disabled=false}) {
  const [pending,setPending]=useState(null);
  const [error,setError]=useState('');
  const activeEmployees=draft.employees.filter(e=>e.isActive);
  const update=(id,patch)=>onChange(draft.shifts.map(s=>{
    if(s.id!==id)return s;
    const next={...s,...patch,source:'MANUAL',isManualOverride:true};
    return {...next,durationHours:calculateShiftDurationHoursV3(next.startTime,next.endTime,next.crossMidnight)};
  }));
  function confirm(){
    const employee=activeEmployees.find(e=>e.id===pending?.employeeId);
    if(!employee || pending.startTime===pending.endTime){setError('Επίλεξε ενεργό εργαζόμενο και διαφορετικές ώρες έναρξης/λήξης.');return;}
    const crossMidnight=pending.endTime<pending.startTime;
    onChange([...draft.shifts,{
      id:crypto.randomUUID(),employeeId:employee.id,employeeName:employee.fullName,date:pending.date,
      startTime:pending.startTime,endTime:pending.endTime,crossMidnight,
      durationHours:calculateShiftDurationHoursV3(pending.startTime,pending.endTime,crossMidnight),
      shiftTemplateId:null,source:'MANUAL',isManualOverride:true,schedulerSchemaVersion:3,draftId:draft.id,
    }]);
    setPending(null);setError('');
  }
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="text-lg font-bold">Προσχέδιο — επεξεργασία πριν τη δημοσίευση</legend>
    {draft.shifts.map(s=><div className="flex flex-wrap items-end gap-2 rounded border border-slate-500 p-2" key={s.id}>
      <label>Ημέρα<select className="input-glass block rounded p-2" value={s.date} onChange={e=>update(s.id,{date:e.target.value})}>{eachDateInRange(draft.periodStart,draft.periodEnd).map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Εργαζόμενος<select className="input-glass block rounded p-2" value={s.employeeId} onChange={e=>{
        const employee=activeEmployees.find(x=>x.id===e.target.value);
        if(employee)update(s.id,{employeeId:employee.id,employeeName:employee.fullName});
      }}>{draft.employees.filter(e=>e.isActive||e.id===s.employeeId).map(e=><option key={e.id} value={e.id} disabled={!e.isActive}>{e.fullName}{e.isActive?'':' (ανενεργός)'}</option>)}</select></label>
      <QuarterHourTimePicker label="Από" value={s.startTime} onChange={startTime=>update(s.id,{startTime,shiftTemplateId:null,crossMidnight:s.endTime<startTime})}/>
      <QuarterHourTimePicker label="Έως" value={s.endTime} onChange={endTime=>update(s.id,{endTime,shiftTemplateId:null,crossMidnight:endTime<s.startTime})}/>
      <span>{s.durationHours} ώρες{s.crossMidnight?' · επόμενη ημέρα':''}</span>
      <button type="button" className="rounded border px-3 py-2" onClick={()=>onChange(draft.shifts.filter(x=>x.id!==s.id))}>Αφαίρεση βάρδιας</button>
    </div>)}
    {!pending?<button type="button" className="rounded border px-3 py-2" disabled={!activeEmployees.length} onClick={()=>setPending({employeeId:'',date:draft.periodStart,startTime:'08:00',endTime:'16:00'})}>+ Προσθήκη εργαζομένου</button>:
      <fieldset className="flex flex-wrap items-end gap-3 rounded border p-3" aria-label="Νέα ανάθεση">
        <legend>Νέα ανάθεση</legend>
        <label>Ημέρα<select className="input-glass block rounded p-2" value={pending.date} onChange={e=>setPending(p=>({...p,date:e.target.value}))}>{eachDateInRange(draft.periodStart,draft.periodEnd).map(d=><option key={d}>{d}</option>)}</select></label>
        <label>Εργαζόμενος<select className="input-glass block rounded p-2" value={pending.employeeId} onChange={e=>setPending(p=>({...p,employeeId:e.target.value}))}><option value="">Επίλεξε εργαζόμενο</option>{activeEmployees.map(e=><option key={e.id} value={e.id}>{e.fullName}</option>)}</select></label>
        <QuarterHourTimePicker label="Από" value={pending.startTime} onChange={startTime=>setPending(p=>({...p,startTime}))}/>
        <QuarterHourTimePicker label="Έως" value={pending.endTime} onChange={endTime=>setPending(p=>({...p,endTime}))}/>
        <button type="button" className="rounded border px-3 py-2" onClick={confirm} disabled={!pending.employeeId}>Προσθήκη</button>
        <button type="button" className="rounded border px-3 py-2" onClick={()=>{setPending(null);setError('');}}>Ακύρωση</button>
        {error&&<p role="alert">{error}</p>}
      </fieldset>}
  </fieldset>;
}
