import fixtures from './fixtures.json' with {type:'json'};
import {requireDemoTenant,type DemoTenant} from './policy.ts';
const sources:Record<DemoTenant,string>={'demo-fuel':'qa-fuel','demo-cafe':'qa-cafe','demo-salon':'qa-salon','demo-market':'qa-market'};
const iso=(time:number)=>new Date(time).toISOString().slice(0,10);
export function publicDemoFixture(id:unknown,now:Date=new Date()){
  const tenant=requireDemoTenant(id),source=sources[tenant],fixture=structuredClone(fixtures.find(t=>t.slug===source)!);
  if(!Number.isFinite(now.getTime()))throw new Error('DEMO_DATE_INVALID');
  const today=Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z'),day=new Date(today).getUTCDay();
  const monday=today-((day+6)%7)*86400000,offset=monday-Date.parse('2026-09-07T00:00:00Z');
  const date=(value:string)=>iso(Date.parse(value+'T00:00:00Z')+offset);
  const employeeIds=new Map(fixture.employees.map(e=>[e.id,e.id.replace(source,tenant)]));
  fixture.slug=tenant;fixture.domain=demoOriginLocal(tenant);fixture.qaSuite='shiftoryx-public-demo-v1';
  fixture.config.tenantId=tenant;
  fixture.config.shiftTemplates=fixture.config.shiftTemplates.map(t=>({...t,label:t.label.replace(/^QA /,'')}));
  fixture.employees=fixture.employees.map(e=>({...e,id:employeeIds.get(e.id)!,fullName:e.fullName.replace(/^QA /,''),schedulerV3:{...e.schedulerV3,rotationAnchorWeekStart:e.schedulerV3.rotationAnchorWeekStart?date(e.schedulerV3.rotationAnchorWeekStart):null}}));
  fixture.absences=fixture.absences.map(a=>({...a,id:a.id.replace(source,tenant),employeeId:employeeIds.get(a.employeeId)!,startDate:date(a.startDate),endDate:date(a.endDate)}));
  return {...fixture,weekStart:iso(monday),weekEnd:iso(monday+6*86400000),isDemo:true};
}
function demoOriginLocal(tenant:DemoTenant){return `${tenant}.shiftoryx.gr`;}
