import AnnouncementBoard from './AnnouncementBoard';
import ProgramHistoryPanel from './ProgramHistoryPanel';

export default function SchedulerToolsV3({draft,onExportDraft,busy,announcementProps,historyProps,historicalDays,onPreviousWeek,onNextWeek,onWeekPdf,onMonthPdf,onExcel,onWord,onWhatsapp}) {
  const button='rounded border px-3 py-2 disabled:opacity-50';
  return <div className="space-y-5" data-testid="scheduler-v3-tools">
    <section aria-label="Εξαγωγές προσχεδίου" className="rounded border p-3 space-y-2">
      <h2 className="font-bold">Εξαγωγές προσχεδίου</h2>
      <p>{draft?`${draft.periodStart} – ${draft.periodEnd}`:'Δημιούργησε ή φόρτωσε ένα προσχέδιο.'}</p>
      <div className="flex flex-wrap gap-2">{[['EXCEL','Excel'],['WORD','Word'],['WHATSAPP','Αντιγραφή για WhatsApp']].map(([format,label])=><button key={format} className={button} disabled={!draft||busy} onClick={()=>onExportDraft(draft,format)}>{label}</button>)}</div>
      <p>Το ακριβές PDF κάθε δημοσιευμένης έκδοσης βρίσκεται στο ιστορικό δημοσιεύσεων.</p>
    </section>
    <AnnouncementBoard {...announcementProps}/>
    <ProgramHistoryPanel {...historyProps} canCreateMonthlyArchive={false}/>
    <details className="rounded border p-3"><summary>Παλαιότερα προγράμματα — μόνο εξαγωγή</summary>
      <p>Οι παρακάτω ενέργειες χρησιμοποιούν το προγενέστερο πρόγραμμα, όχι το νέο προσχέδιο.</p>
      <p>{historicalDays?.[0]} – {historicalDays?.at(-1)}</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={onPreviousWeek}>Προηγούμενη εβδομάδα</button><button className={button} onClick={onNextWeek}>Επόμενη εβδομάδα</button>
        <button className={button} disabled={busy} onClick={onWeekPdf}>PDF εβδομάδας</button><button className={button} disabled={busy} onClick={onMonthPdf}>PDF μήνα</button>
        <button className={button} disabled={busy} onClick={onExcel}>Excel παλαιότερου προγράμματος</button><button className={button} disabled={busy} onClick={onWord}>Word παλαιότερου προγράμματος</button><button className={button} disabled={busy} onClick={onWhatsapp}>Αντιγραφή παλαιότερου προγράμματος</button>
      </div>
    </details>
  </div>;
}
