import { makeDefaultConfigV3 } from '../../src/services/schedulerV3Service.ts';
import { normalizeEmployeeProfileV3 } from '../../src/scheduler-engine-v3/employeeProfile.ts';
import type { EmployeeV3, SchedulerConfigV3 } from '../../src/scheduler-engine-v3/types.ts';

export const QA_PROJECT = 'demo-shiftoryx-realistic';
export const QA_SUITE = 'scheduler-v3-realistic-v1';
export const PERIODS = { WEEK: ['2026-09-07','2026-09-13'], MONTH: ['2026-09-01','2026-09-30'] } as const;
const weekdays = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] as const;
const range = (startTime:string,endTime:string) => ({startTime,endTime});
const shifts = {
  fuel: [['early','06:00','14:00'],['late','14:00','22:00']],
  cafe: [['early','06:00','14:00'],['mid','10:00','18:00'],['late','14:00','22:00']],
  salon: [['early','08:00','14:00'],['mid','10:00','18:00'],['late','14:00','20:00']],
  market: [['early','07:00','15:00'],['late','15:00','23:00']],
};
function config(slug:string,kind:keyof typeof shifts,open:string,close:string,counts:number[][]):SchedulerConfigV3 {
  const result=makeDefaultConfigV3(slug);
  result.templateId=QA_SUITE;
  result.shiftTemplates=shifts[kind].map(([id,startTime,endTime])=>({id,label:`QA ${startTime}–${endTime}`,shortCode:id.toUpperCase(),shiftType:'CUSTOM',startTime,endTime,durationHours:(Number(endTime.slice(0,2))-Number(startTime.slice(0,2))),crossMidnight:false,isActive:true}));
  result.operatingDays=weekdays.map((weekday,i)=>({weekday,isOpen:counts[i].some(Boolean),windows:counts[i].some(Boolean)?[{openTime:open,closeTime:close,crossMidnight:false}]:[]}));
  result.coverageRequirements=weekdays.map((weekday,i)=>({weekday,slots:result.shiftTemplates.map((s,n)=>({shiftTemplateId:s.id,headcount:counts[i][n]}))}));
  result.warningPolicies={minRestIntervalHours:11,maxDailyHours:10,maxWeeklyHours:48,maxConsecutiveWorkingDays:6};
  return result;
}
function employee(slug:string,n:number,name:string,target:number|null,off:number|null,start:string,end:string,rotation=false,substitute=false):EmployeeV3 {
  return {id:`${slug}-e${n}`,fullName:`QA ${name}`,isActive:true,color:'#2563eb',schedulerV3:normalizeEmployeeProfileV3({targetWeeklyHours:target,fixedDayOff:off,standardShift:range(start,end),workMode:substitute?'SUBSTITUTE_ONLY':'NORMAL',rotateStandardShiftWeekly:rotation,
    rotationAlternateShift:rotation?(start==='08:00'?range('14:00','20:00'):start==='14:00'&&end==='20:00'?range('08:00','14:00'):range('14:00','22:00')):null,rotationAnchorWeekStart:rotation?'2026-09-07':null})};
}
export function realisticTenants() {
  const fuel='qa-fuel',cafe='qa-cafe',salon='qa-salon',market='qa-market';
  const absence=(slug:string,n:number,startDate:string,endDate=startDate)=>({id:`${slug}-absence-${n}`,employeeId:`${slug}-e${n}`,type:'LEAVE',scope:'FULL_DAY',status:'APPROVED',startDate,endDate});
  return [
    {slug:fuel,name:'Fuel Station Demo',category:'FUEL_STATION',domain:`${fuel}.shiftoryx.gr`,qaSuite:QA_SUITE,
      story:'Πρατήριο 06–22. Πέντε κανονικοί εργαζόμενοι και ένας ρητός αναπληρωματικός. Η άδεια του Γιάννη δυσκολεύει την πρωινή κάλυψη.',
      config:config(fuel,'fuel','06:00','22:00',[[2,2],[2,2],[2,2],[2,2],[2,2],[2,2],[1,1]]),
      employees:[employee(fuel,1,'Άννα',40,0,'06:00','14:00',true),employee(fuel,2,'Γιάννης',40,2,'06:00','14:00'),employee(fuel,3,'Μαρία',32,3,'14:00','22:00'),employee(fuel,4,'Πέτρος',40,4,'14:00','22:00'),employee(fuel,5,'Ελένη',20,6,'06:00','14:00'),employee(fuel,6,'Νίκος — αναπλήρωση',20,0,'14:00','22:00',false,true)],
      absences:[absence(fuel,2,'2026-09-09','2026-09-11')]},
    {slug:cafe,name:'Café Demo',category:'CAFE',domain:`${cafe}.shiftoryx.gr`,qaSuite:QA_SUITE,
      story:'Καφέ με πρωινή αιχμή και αυξημένη ζήτηση Παρασκευή/Σαββατοκύριακο. Η άδεια της Σοφίας απαιτεί ανακατανομή.',
      config:config(cafe,'cafe','06:00','22:00',[[2,1,1],[2,1,1],[2,1,1],[2,1,2],[2,2,2],[3,2,3],[2,2,2]]),
      employees:[employee(cafe,1,'Σοφία',40,1,'06:00','14:00'),employee(cafe,2,'Κώστας',40,2,'06:00','14:00'),employee(cafe,3,'Δανάη',32,3,'10:00','18:00'),employee(cafe,4,'Αλέξης',40,4,'14:00','22:00'),employee(cafe,5,'Λένα',20,5,'10:00','18:00'),employee(cafe,6,'Μάνος',32,1,'14:00','22:00'),employee(cafe,7,'Ιωάννα',20,2,'06:00','14:00'),employee(cafe,8,'Ορέστης',32,3,'14:00','22:00')],
      absences:[absence(cafe,1,'2026-09-10','2026-09-12')]},
    {slug:salon,name:'Hair Salon Demo',category:'HAIR_SALON',domain:`${salon}.shiftoryx.gr`,qaSuite:QA_SUITE,
      story:'Κομμωτήριο Τρίτη–Σάββατο. Δύο ανεξάρτητες εναλλαγές εξάωρων βαρδιών και σταθερά προσωπικά ωράρια.',
      config:config(salon,'salon','08:00','20:00',[[0,0,0],[1,1,1],[1,1,1],[1,2,1],[1,2,1],[2,2,2],[0,0,0]]),
      employees:[employee(salon,1,'Χριστίνα',32,1,'08:00','14:00',true),employee(salon,2,'Βασίλης',32,0,'14:00','20:00',true),employee(salon,3,'Νάντια',40,1,'10:00','18:00'),employee(salon,4,'Άρης',40,0,'10:00','18:00'),employee(salon,5,'Ράνια',32,3,'14:00','20:00'),employee(salon,6,'Δήμητρα',32,2,'08:00','14:00')],absences:[]},
    {slug:market,name:'Mini Market Demo',category:'RETAIL',domain:`${market}.shiftoryx.gr`,qaSuite:QA_SUITE,
      story:'Mini market επτά ημερών με τρία άτομα ανά βάρδια το Σάββατο και μειωμένο απογευματινό προσωπικό Κυριακής.',
      config:config(market,'market','07:00','23:00',[[2,2],[2,2],[2,2],[2,2],[2,2],[3,3],[3,2]]),
      employees:[employee(market,1,'Γιώργος',40,1,'07:00','15:00'),employee(market,2,'Κατερίνα',40,2,'07:00','15:00'),employee(market,3,'Στέλιος',32,3,'15:00','23:00'),employee(market,4,'Αθηνά',40,4,'15:00','23:00'),employee(market,5,'Θοδωρής',32,5,'07:00','15:00'),employee(market,6,'Βίκυ',20,6,'15:00','23:00'),employee(market,7,'Ηλίας',40,0,'07:00','15:00'),employee(market,8,'Μυρτώ',32,2,'15:00','23:00'),employee(market,9,'Τάσος',20,3,'07:00','15:00')],
      absences:[absence(market,3,'2026-09-11','2026-09-13')]},
  ];
}
