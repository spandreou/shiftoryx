import {
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  commitBatchChunks,
  createLocalUnsubscribe,
  ensureFirestoreReady,
  tenantCollection,
  tenantDoc,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';
import { normalizeTenantId, TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';
import { publicDemoEnabled } from '../demo/config';

function sortByDateAndTime(a, b) {
  return `${a.date}_${a.startTime}_${a.employeeName}`.localeCompare(
    `${b.date}_${b.startTime}_${b.employeeName}`,
    'el',
  );
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePublicToken(value) {
  return safeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isPublicWorkShift(shift) {
  const type = normalizePublicToken(shift?.type || 'work');
  const shiftType = normalizePublicToken(shift?.shiftType);
  const label = normalizePublicToken(`${shift?.label || ''} ${shift?.customLabel || ''}`);
  const sensitiveTokens = [
    'leave',
    'sick',
    'absence',
    'absent',
    'rest',
    'day_off',
    'off',
    'αδεια',
    'ασθεν',
    'απουσ',
    'ρεπο',
  ];

  if (type && type !== 'work') return false;
  if (!safeText(shift?.date) || !safeText(shift?.startTime) || !safeText(shift?.endTime)) return false;
  return !sensitiveTokens.some((token) => type.includes(token) || shiftType.includes(token) || label.includes(token));
}

function sanitizePublishedShift(shift, employeeById) {
  const employeeName = safeText(employeeById.get(shift?.employeeId)?.fullName || shift?.employeeName);
  return {
    employeeName,
    date: safeText(shift?.date),
    startTime: safeText(shift?.startTime),
    endTime: safeText(shift?.endTime),
    type: safeText(shift?.type) || 'work',
    label: safeText(shift?.label || shift?.customLabel),
    shiftType: safeText(shift?.shiftType),
  };
}

function sanitizePublishedSchedule({ tenantId, weekStart, weekDays, shifts = [], employees = [] }) {
  const days = Array.isArray(weekDays) && weekDays.length ? weekDays.filter(Boolean) : [];
  const weekDaySet = new Set(days);
  const employeeById = new Map((employees || []).map((employee) => [employee.id, employee]));
  const publicShifts = (shifts || [])
    .filter((shift) => shift?.date && (!weekDaySet.size || weekDaySet.has(shift.date)))
    .filter(isPublicWorkShift)
    .map((shift) => sanitizePublishedShift(shift, employeeById))
    .filter((shift) => shift.employeeName && shift.date && shift.startTime && shift.endTime)
    .sort(sortByDateAndTime);

  return {
    tenantId: normalizeTenantId(tenantId),
    weekStart,
    weekEnd: days[6] || days[days.length - 1] || weekStart,
    shiftCount: publicShifts.length,
    shifts: publicShifts,
  };
}

function sanitizePublishedMonth({
  tenantId,
  yearMonth,
  monthStart,
  monthEnd,
  monthDays = [],
  weekStarts = [],
  shifts = [],
  employees = [],
}) {
  const monthDaySet = new Set((monthDays || []).filter(Boolean));
  const employeeById = new Map((employees || []).map((employee) => [employee.id, employee]));
  const publicShifts = (shifts || [])
    .filter((shift) => shift?.date && (!monthDaySet.size || monthDaySet.has(shift.date)))
    .filter(isPublicWorkShift)
    .map((shift) => sanitizePublishedShift(shift, employeeById))
    .filter((shift) => shift.employeeName && shift.date && shift.startTime && shift.endTime)
    .sort(sortByDateAndTime);

  return {
    tenantId: normalizeTenantId(tenantId),
    yearMonth,
    monthStart,
    monthEnd,
    monthDays: [...monthDaySet].sort(),
    weekStarts: [...new Set(weekStarts || [])].filter(Boolean).sort(),
    shiftCount: publicShifts.length,
    shifts: publicShifts,
  };
}

function sanitizePublicEmployee(employee, tenantId) {
  return {
    tenantId: normalizeTenantId(tenantId),
    fullName: safeText(employee?.fullName || employee?.name),
    role: safeText(employee?.role),
    color: safeText(employee?.color),
    isActive: employee?.isActive !== false,
  };
}

function sanitizePublicAnnouncement(announcement, tenantId) {
  return {
    tenantId: normalizeTenantId(tenantId),
    title: safeText(announcement?.title),
    body: safeText(announcement?.body),
  };
}

export function subscribePublishedSchedule(input, onData, onError) {
  const weekStart = input?.weekStart;
  const tenantId = input?.tenantId;
  if (!db || !weekStart) {
    onData?.(null);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicSchedules, weekStart),
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError,
  );
}

export function subscribePublishedMonth({ tenantId, yearMonth }, onData, onError) {
  if (!db || !yearMonth) {
    onData?.(null);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicMonths, yearMonth),
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError,
  );
}

export function subscribePublicEmployees({ tenantId }, onData, onError) {
  if (!db) {
    onData?.([]);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.publicEmployees), orderBy('fullName', 'asc')),
    (snapshot) => onData(toDataWithId(snapshot)),
    onError,
  );
}

export function subscribePublicAnnouncements({ tenantId }, onData, onError) {
  if (!db) {
    onData?.([]);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.publicAnnouncements), orderBy('createdAt', 'desc')),
    (snapshot) => onData(toDataWithId(snapshot)),
    onError,
  );
}

export async function publishWeekSchedule({ tenantId, weekStart, weekDays, shifts = [], employees = [] }) {
  ensureFirestoreReady();
  if (!weekStart) throw new Error('Λείπει εβδομάδα για δημόσια προβολή προγράμματος.');

  const payload = sanitizePublishedSchedule({ tenantId, weekStart, weekDays, shifts, employees });
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicSchedules, weekStart), {
      ...payload,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function publishMonthSchedule({
  tenantId,
  yearMonth,
  monthStart,
  monthEnd,
  monthDays = [],
  weekStarts = [],
  shifts = [],
  employees = [],
}) {
  ensureFirestoreReady();
  if (!yearMonth) throw new Error('Λείπει μήνας για δημόσια προβολή προγράμματος.');

  const payload = sanitizePublishedMonth({
    tenantId,
    yearMonth,
    monthStart,
    monthEnd,
    monthDays,
    weekStarts,
    shifts,
    employees,
  });
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicMonths, yearMonth), {
      ...payload,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function publishPublicEmployees({ tenantId, employees = [] }) {
  ensureFirestoreReady();
  const safeEmployees = (employees || []).filter((employee) => employee?.id);
  // Trusted demo mutations write the private row and public projection together.
  if (publicDemoEnabled) return safeEmployees.length;
  const existingSnapshot = await getDocs(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.publicEmployees));
  const nextIds = new Set(safeEmployees.map((employee) => employee.id));

  const operations = [
    ...safeEmployees.map((employee) => ({
      type: 'set',
      id: employee.id,
      payload: sanitizePublicEmployee(employee, tenantId),
    })),
    ...existingSnapshot.docs
      .filter((snapshot) => !nextIds.has(snapshot.id))
      .map((snapshot) => ({ type: 'delete', id: snapshot.id })),
  ];

  await commitBatchChunks(operations, (batch, operation) => {
    const ref = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicEmployees, operation.id);
    if (operation.type === 'delete') {
      batch.delete(ref);
      return;
    }

    batch.set(ref, {
      ...operation.payload,
      updatedAt: serverTimestamp(),
    });
  });

  return safeEmployees.length;
}

export async function publishPublicAnnouncement({ tenantId, announcement }) {
  ensureFirestoreReady();
  if (!announcement?.id) throw new Error('Λείπει ανακοίνωση για δημόσια προβολή.');

  const payload = sanitizePublicAnnouncement(announcement, tenantId);
  if (publicDemoEnabled) return payload;
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicAnnouncements, announcement.id), {
      ...payload,
      createdAt: announcement.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function deletePublicAnnouncement({ tenantId, announcementId }) {
  ensureFirestoreReady();
  if (!announcementId) return false;
  if (publicDemoEnabled) return true;
  await withFirestoreWrite(() =>
    deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicAnnouncements, announcementId)),
  );
  return true;
}

export async function deletePublishedSchedulesByWeekStarts(input = []) {
  ensureFirestoreReady();
  const weekStarts = input?.weekStarts;
  const tenantId = input?.tenantId;
  const uniqueWeekStarts = [...new Set(weekStarts || [])].filter(Boolean);
  if (!uniqueWeekStarts.length) return 0;

  await commitBatchChunks(uniqueWeekStarts, (batch, weekStart) => {
    batch.delete(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicSchedules, weekStart));
  });

  return uniqueWeekStarts.length;
}

export async function deletePublishedMonth({ tenantId, yearMonth }) {
  ensureFirestoreReady();
  if (!yearMonth) return false;
  await withFirestoreWrite(() =>
    deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.publicMonths, yearMonth)),
  );
  return true;
}
