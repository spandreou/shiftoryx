import {analyzeDraftV3, decodeDraftProfilesV3, type DraftV3} from './schedulerV3Service.ts';
import {validateEmployeeProfileV3} from '../scheduler-engine-v3/employeeProfile.ts';
import {isIsoDateV3} from '../scheduler-engine-v3/config.ts';

const dangerous = new Set(['__proto__', 'prototype', 'constructor']);
function invalid(): never { throw Object.assign(new Error('Invalid publication preview.'), {code: 'INVALID_PREVIEW'}); }
export function plainRecord(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
}
export function onlyKeys(value: unknown, keys: readonly string[]) {
  plainRecord(value);
  if (Object.keys(value).some(key => !keys.includes(key) || dangerous.has(key))) invalid();
}
/** No custom toJSON/getters, prototypes, cycles, sparse arrays or non-JSON numbers. */
export function canonicalJson(value: unknown): string {
  const seen = new Set<object>(); let nodes = 0;
  function encode(v: any, depth: number): string {
    if (++nodes > 100000 || depth > 30) invalid();
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { if (!Number.isFinite(v)) invalid(); return JSON.stringify(v); }
    if (typeof v !== 'object' || seen.has(v)) invalid();
    seen.add(v);
    if (Object.getOwnPropertySymbols(v).length) invalid();
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (dangerous.has(key) || !('value' in descriptor)) invalid();
    }
    let result: string;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length) invalid();
      const items: string[] = [];
      for (let i = 0; i < v.length; i++) { if (!Object.hasOwn(v, i)) invalid(); items.push(encode(v[i], depth + 1)); }
      result = '[' + items.join(',') + ']';
    } else {
      plainRecord(v);
      result = '{' + Object.keys(v).sort().filter(k => v[k] !== undefined)
        .map(k => JSON.stringify(k) + ':' + encode(v[k], depth + 1)).join(',') + '}';
    }
    seen.delete(v); return result;
  }
  return encode(value, 0);
}
const id = (v: unknown) => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) invalid(); };
const text = (v: unknown) => { if (typeof v !== 'string' || !v.length || v.length > 200 || /[\u0000-\u001f\u007f]/.test(v)) invalid(); };

export function normalizePreviewV3(input: DraftV3): DraftV3 {
  // Validate the original graph before selecting fields; ignored fields cannot hide executable values.
  canonicalJson(input); plainRecord(input);
  id(input.id);
  if (!Array.isArray(input.employees) || input.employees.length > 100 || !Array.isArray(input.shifts) || input.shifts.length > 449 ||
      !Array.isArray(input.absences) || input.absences.length > 1000) invalid();
  onlyKeys(input.options, ['balanceWeeklyTargets']);
  if (typeof input.options.balanceWeeklyTargets !== 'boolean') invalid();
  const config = input.config;
  onlyKeys(config, ['schemaVersion','tenantId','timezone','weekStartDay','templateId','templateVersion','operatingDays','shiftTemplates','coverageRequirements','generationDefaults','warningPolicies']);
  for (const key of ['tenantId','timezone','templateId']) text(config[key]);
  for (const list of ['operatingDays','shiftTemplates','coverageRequirements']) if (!Array.isArray(config[list])) invalid();
  for (const d of config.operatingDays) { onlyKeys(d,['weekday','isOpen','windows']); if (!Array.isArray(d.windows)) invalid(); for (const w of d.windows) onlyKeys(w,['openTime','closeTime','crossMidnight']); }
  for (const t of config.shiftTemplates) { onlyKeys(t,['id','label','shortCode','shiftType','startTime','endTime','durationHours','crossMidnight','isActive']); id(t.id); text(t.label); text(t.shortCode); }
  for (const d of config.coverageRequirements) { onlyKeys(d,['weekday','slots']); if (!Array.isArray(d.slots)) invalid(); for (const s of d.slots) onlyKeys(s,['shiftTemplateId','headcount']); }
  onlyKeys(config.generationDefaults,['balanceWeeklyTargetsForMonth']);
  if (config.warningPolicies) onlyKeys(config.warningPolicies,['minRestIntervalHours','maxDailyHours','maxWeeklyHours','maxConsecutiveWorkingDays']);
  for (const e of input.employees) {
    plainRecord(e); id(e.id); text(e.fullName);
    if (typeof e.isActive !== 'boolean' || !e.schedulerV3 || !validateEmployeeProfileV3(e.schedulerV3).valid) invalid();
    for (const value of [e.activeFrom,e.activeTo]) if (value !== undefined && value !== null && (typeof value !== 'string' || !isIsoDateV3(value))) invalid();
    if (e.color !== undefined) text(e.color);
  }
  const employees = decodeDraftProfilesV3(input).employees;
  const byId = new Map(employees.map(e => [e.id, e]));
  const absences = input.absences.map(a => {
    plainRecord(a); id(a.id); id(a.employeeId);
    if (!byId.has(a.employeeId) || !['LEAVE','SICK','OTHER'].includes(a.type)) invalid();
    return {id:a.id, employeeId:a.employeeId, type:a.type, startDate:a.startDate, endDate:a.endDate, scope:a.scope};
  });
  if (new Set(absences.map(a=>a.id)).size !== absences.length) invalid();
  const shifts = input.shifts.map(s => {
    onlyKeys(s,['id','date','employeeId','employeeName','shiftTemplateId','startTime','endTime','durationHours','crossMidnight','source','isManualOverride','schedulerSchemaVersion','draftId','type']);
    id(s.id); id(s.employeeId);
    if (!byId.has(s.employeeId) || (s.draftId !== undefined && s.draftId !== input.id) ||
        (s.crossMidnight !== undefined && typeof s.crossMidnight !== 'boolean') || (s.type !== undefined && s.type !== 'work')) invalid();
    return {id:s.id,date:s.date,employeeId:s.employeeId,employeeName:byId.get(s.employeeId)!.fullName,shiftTemplateId:s.shiftTemplateId,
      startTime:s.startTime,endTime:s.endTime,durationHours:s.durationHours,crossMidnight:Boolean(s.crossMidnight),source:s.source,
      isManualOverride:s.isManualOverride,schedulerSchemaVersion:s.schedulerSchemaVersion,draftId:input.id};
  });
  if (input.sourcePublicationId !== undefined) id(input.sourcePublicationId);
  const result: DraftV3 = {id:input.id, config:structuredClone(config), employees, absences, shifts,
    periodType:input.periodType,periodStart:input.periodStart,periodEnd:input.periodEnd,options:{balanceWeeklyTargets:input.options.balanceWeeklyTargets},
    ...(input.sourcePublicationId !== undefined ? {sourcePublicationId:input.sourcePublicationId} : {})};
  try { analyzeDraftV3(result); } catch { invalid(); }
  return result;
}
export function serializePreviewV3(input: DraftV3): string {
  try { return canonicalJson(normalizePreviewV3(input)); } catch { invalid(); }
}
export async function hashPreviewV3(input: DraftV3): Promise<string> {
  const bytes = new TextEncoder().encode(serializePreviewV3(input));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}
