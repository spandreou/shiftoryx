export default function QuarterHourTimePicker({ label, value, onChange, disabled=false }) {
  const options=Array.from({length:96},(_,n)=>`${String(Math.floor(n/4)).padStart(2,'0')}:${String(n%4*15).padStart(2,'0')}`);
  return <label className="grid gap-1 text-sm"><span>{label} <span aria-hidden="true">🕒</span></span><select aria-label={label} className="input-glass rounded p-2" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>{!options.includes(value)&&<option value={value} disabled>{value||'—'}</option>}{options.map(t=><option key={t}>{t}</option>)}</select></label>;
}
