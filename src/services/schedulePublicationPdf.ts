import type { SchedulePublicationV3 } from '../scheduler-engine-v3/types.ts';
export async function renderPublicationPdfV3(snapshot:SchedulePublicationV3, options?:{creationDate:string;fileId:string}):Promise<Uint8Array> {
  const [{jsPDF:JsPDF},font]=await Promise.all([import('jspdf'),import('../assets/fonts/robotoRegularBase64.js')]);
  const pdf=new JsPDF({orientation:'landscape',unit:'pt',format:'a4'});
  // Opt-in server determinism only. Existing browser callers retain jsPDF defaults.
  if(options){
    if(!/^[0-9a-f]{32}$/i.test(options.fileId)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(options.creationDate)||new Date(options.creationDate).toISOString()!==options.creationDate)throw new Error('Invalid deterministic PDF options.');
    pdf.setFileId(options.fileId);
    pdf.setCreationDate('D:'+options.creationDate.slice(0,19).replace(/\D/g,'')+"+00'00'");
  }
  pdf.addFileToVFS('Roboto.ttf',font.ROBOTO_REGULAR_BASE64);pdf.addFont('Roboto.ttf','Roboto','normal');pdf.setFont('Roboto');pdf.setFontSize(12);
  let y=45;
  const line=(text:string)=>{if(y>550){pdf.addPage();y=45;}for(const part of pdf.splitTextToSize(text,740)){pdf.text(part,35,y);y+=18;}};
  line(`ShiftOryx · ${snapshot.periodStart} — ${snapshot.periodEnd} · Έκδοση ${snapshot.version}`);
  line('Ημερομηνία | Ονοματεπώνυμο | Ωράριο | Εργασία');
  for(const shift of snapshot.shifts)line(`${shift.date} | ${shift.employeeName} | ${shift.startTime}–${shift.endTime} | ΕΡΓ`);
  line('Σύνολα ωρών');
  for(const employee of snapshot.employeeSnapshot) {const hours=snapshot.calculatedHours.find(h=>h.employeeId===employee.employeeId);line(`${employee.displayName}: ${hours?.hours||0} ώρες`);}
  if(snapshot.publishedWithWarnings)line(`Δημοσιεύτηκε με ${snapshot.warningsAtPublish.length} προειδοποιήσεις μετά από έλεγχο OWNER.`);
  return new Uint8Array(pdf.output('arraybuffer'));
}
