export default function QuarterHourTimePicker({ label, value, onChange, disabled=false }) {
  const options=Array.from({length:96},(_,n)=>`${String(Math.floor(n/4)).padStart(2,'0')}:${String(n%4*15).padStart(2,'0')}`);
  return <label className="grid gap-1 text-sm">{label}<select className="input-glass rounded p-2" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>{!options.includes(value)&&<option value={value}>{value}</option>}{options.map(t=><option key={t}>{t}</option>)}</select></label>;
}
