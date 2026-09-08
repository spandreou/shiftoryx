import { calculateShiftDurationHoursV3, eachDateInRange } from '../../scheduler-engine-v3/index.ts';
import QuarterHourTimePicker from './QuarterHourTimePicker';
export default function SchedulePreviewV3({draft,onChange,disabled=false}) {
  const update=(id,patch)=>onChange(draft.shifts.map(s=>{if(s.id!==id)return s;const next={...s,...patch,source:'MANUAL',isManualOverride:true};return {...next,durationHours:calculateShiftDurationHoursV3(next.startTime,next.endTime,next.crossMidnight)};}));
  return <fieldset disabled={disabled} className="space-y-3"><legend className="text-lg font-bold">Προσχέδιο — επεξεργασία πριν τη δημοσίευση</legend>
    {draft.shifts.map(s=><div className="flex flex-wrap items-end gap-2 rounded border border-slate-500 p-2" key={s.id}>
      <label>Ημέρα<select className="input-glass block rounded p-2" value={s.date} onChange={e=>update(s.id,{date:e.target.value})}>{eachDateInRange(draft.periodStart,draft.periodEnd).map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Εργαζόμενος<select className="input-glass block rounded p-2" value={s.employeeId} onChange={e=>update(s.id,{employeeId:e.target.value,employeeName:draft.employees.find(x=>x.id===e.target.value)?.fullName})}>{draft.employees.map(e=><option key={e.id} value={e.id}>{e.fullName}{e.isActive?'':' (ανενεργός)'}</option>)}</select></label>
      <QuarterHourTimePicker label="Από" value={s.startTime} onChange={startTime=>update(s.id,{startTime,shiftTemplateId:null,crossMidnight:s.endTime<startTime})}/><QuarterHourTimePicker label="Έως" value={s.endTime} onChange={endTime=>update(s.id,{endTime,shiftTemplateId:null,crossMidnight:endTime<s.startTime})}/>
      <span>{s.durationHours} ώρες{s.crossMidnight?' · επόμενη ημέρα':''}</span><button type="button" className="rounded border px-3 py-2" onClick={()=>onChange(draft.shifts.filter(x=>x.id!==s.id))}>Αφαίρεση βάρδιας</button>
    </div>)}
    <button type="button" className="rounded border px-3 py-2" disabled={!draft.employees.length} onClick={()=>onChange([...draft.shifts,{id:crypto.randomUUID(),employeeId:draft.employees[0].id,employeeName:draft.employees[0].fullName,date:draft.periodStart,startTime:'08:00',endTime:'16:00',durationHours:8,crossMidnight:false,shiftTemplateId:null,source:'MANUAL',isManualOverride:true,schedulerSchemaVersion:3,draftId:draft.id}])}>Προσθήκη χειροκίνητης βάρδιας</button>
  </fieldset>;
}
