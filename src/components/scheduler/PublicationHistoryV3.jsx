import { useState } from 'react';
export default function PublicationHistoryV3({publications,onDownload,onCreateDraft,busy=false}) {
  const [selected,setSelected]=useState(null);
  return <section className="space-y-3" aria-label="Ιστορικό δημοσιεύσεων">
    <h2 className="text-lg font-bold">Ιστορικό δημοσιεύσεων</h2>
    {!publications.length&&<p>Δεν υπάρχουν δημοσιεύσεις.</p>}
    {publications.map(p=><article className="space-y-2 rounded border border-slate-500 p-3" key={p.id} aria-label={`Έκδοση ${p.version} ${p.periodStart}`}>
      <h3>{p.periodStart} – {p.periodEnd} · {p.periodType} · Έκδοση {p.version}</h3>
      <p>Δημοσιεύτηκε: <time dateTime={p.publishedAt}>{p.publishedAt}</time></p>
      <p>{p.employeeSnapshot.length} εργαζόμενοι · {p.calculatedHours.reduce((sum,e)=>sum+e.hours,0)} ώρες · {p.warningsAtPublish.length} προειδοποιήσεις</p>
      <p>{p.publishedWithWarnings?'Με προειδοποιήσεις':'Χωρίς προειδοποιήσεις'}</p>
      <div className="flex flex-wrap gap-2">
        <button className="rounded border px-3 py-2" onClick={()=>setSelected(p)}>Προβολή</button>
        <button className="rounded border px-3 py-2" disabled={busy} onClick={()=>onDownload(p)}>Λήψη PDF</button>
        <button className="rounded border px-3 py-2" disabled={busy} onClick={()=>onCreateDraft(p)}>Δημιουργία draft από αυτή την έκδοση</button>
      </div>
    </article>)}
    {selected&&<section className="space-y-2 rounded border p-3" aria-label="Προβολή δημοσίευσης">
      <h3>Έκδοση {selected.version} · {selected.periodStart} – {selected.periodEnd}</h3>
      <p>Ιστορική προβολή — οι αλλαγές γίνονται σε νέο προσχέδιο.</p>
      <div className="overflow-x-auto"><table><thead><tr><th>Ημέρα</th><th>Εργαζόμενος</th><th>Από</th><th>Έως</th><th>Ώρες</th></tr></thead><tbody>{selected.shifts.map(s=><tr key={s.id}><td>{s.date}</td><td>{s.employeeName}</td><td>{s.startTime}</td><td>{s.endTime}</td><td>{s.durationHours}</td></tr>)}</tbody></table></div>
      <ul>{selected.employeeSnapshot.map(e=><li key={e.employeeId}>{e.displayName}: {selected.calculatedHours.find(h=>h.employeeId===e.employeeId)?.hours??0} ώρες</li>)}</ul>
      <button className="rounded border px-3 py-2" onClick={()=>setSelected(null)}>Κλείσιμο προβολής</button>
    </section>}
  </section>;
}
