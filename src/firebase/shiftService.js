import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';
import {
  chunkValues,
  commitBatchChunks,
  createLocalUnsubscribe,
  ensureFirestoreReady,
  handleFirestoreFailure,
  tenantCollection,
  tenantDoc,
  timestampedPayload,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';

export function subscribeShifts({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const shiftsQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts), orderBy('date', 'asc'));
  return onSnapshot(
    shiftsQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot).filter(shift => shift.schedulerSchemaVersion !== 3));
    },
    onError,
  );
}

export function subscribeShiftTemplates({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const templatesQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shiftTemplates));
  return onSnapshot(
    templatesQuery,
    (snapshot) => {
      const templates = toDataWithId(snapshot).sort((a, b) => (a.label || '').localeCompare(b.label || '', 'el'));
      onData(templates);
    },
    onError,
  );
}

export async function createShift({ tenantId, ...payload }) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function createShiftTemplate({ tenantId, ...payload }) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shiftTemplates), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function restoreShift(shift, { tenantId } = {}) {
  if (!shift?.id) {
    throw new Error('Δεν υπάρχει id βάρδιας για επαναφορά.');
  }

  ensureFirestoreReady();
  const { id, ...payload } = shift;
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shifts, id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }),
  );

  return shift;
}

export async function updateShift(shiftId, payload, { tenantId } = {}) {
  ensureFirestoreReady();

  const shiftDoc = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shifts, shiftId);
  await withFirestoreWrite(() =>
    updateDoc(shiftDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeShift(shiftId, { tenantId } = {}) {
  ensureFirestoreReady();

  const shiftDocRef = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shifts, shiftId);
  const shiftDoc = await getDoc(shiftDocRef);
  const removedShift = shiftDoc.exists() ? { id: shiftDoc.id, ...shiftDoc.data() } : null;
  await withFirestoreWrite(() => deleteDoc(shiftDocRef));

  return removedShift;
}

export async function removeShiftsByEmployee(employeeId, { tenantId } = {}) {
  ensureFirestoreReady();

  const shiftsSnapshot = await getDocs(
    query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts), where('employeeId', '==', employeeId)),
  );

  const legacyDocs = shiftsSnapshot.docs.filter(item => item.data().schedulerSchemaVersion !== 3);
  const removed = legacyDocs.map((item) => ({ id: item.id, ...item.data() }));
  await commitBatchChunks(legacyDocs, (batch, item) => {
    batch.delete(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shifts, item.id));
  });

  return removed;
}

export async function removeShiftsByDates(dates, { tenantId } = {}) {
  ensureFirestoreReady();

  const dateValues = [...new Set(dates || [])].filter(Boolean);
  if (!dateValues.length) return [];

  const matchedDocsById = new Map();

  for (const dateChunk of chunkValues(dateValues)) {
    const shiftsSnapshot = await getDocs(
      query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts), where('date', 'in', dateChunk)),
    );

    shiftsSnapshot.docs.forEach((item) => {
      if (item.data().schedulerSchemaVersion !== 3) matchedDocsById.set(item.id, item);
    });
  }

  const matchedDocs = [...matchedDocsById.values()];
  const removed = matchedDocs.map((item) => ({ id: item.id, ...item.data() }));

  await commitBatchChunks(matchedDocs, (batch, item) => {
    batch.delete(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shifts, item.id));
  });

  return removed;
}

export async function removeShiftTemplate(templateId, { tenantId } = {}) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shiftTemplates, templateId)));
}

export async function updateShiftTemplate(templateId, payload, { tenantId } = {}) {
  ensureFirestoreReady();

  const templateDoc = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shiftTemplates, templateId);
  await withFirestoreWrite(() =>
    updateDoc(templateDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function fetchShiftsOnce({ tenantId } = {}) {
  ensureFirestoreReady();

  const shiftsQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts), orderBy('date', 'asc'));
  try {
    const snapshot = await getDocs(shiftsQuery);
    return toDataWithId(snapshot).filter(shift => shift.schedulerSchemaVersion !== 3);
  } catch (error) {
    handleFirestoreFailure(error);
    return [];
  }
}

export async function fetchShiftsByDates(dates, { tenantId } = {}) {
  ensureFirestoreReady();

  const dateValues = [...new Set(dates || [])].filter(Boolean);
  if (!dateValues.length) return [];

  const matchedShifts = [];

  for (const dateChunk of chunkValues(dateValues)) {
    const shiftsSnapshot = await getDocs(
      query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts), where('date', 'in', dateChunk)),
    );

    matchedShifts.push(...toDataWithId(shiftsSnapshot).filter(shift => shift.schedulerSchemaVersion !== 3));
  }

  return matchedShifts.sort((a, b) => `${a.date}_${a.startTime}`.localeCompare(`${b.date}_${b.startTime}`));
}

export async function hasConsecutiveSundayAssignment({ tenantId, employeeId, previousSundayDate }) {
  if (!employeeId || !previousSundayDate) return false;
  ensureFirestoreReady();

  const sundaySnapshot = await getDocs(
    query(
      tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts),
      where('employeeId', '==', employeeId),
      where('date', '==', previousSundayDate),
      where('type', '==', 'work'),
    ),
  );

  return sundaySnapshot.docs.some((item) => {
    const shift = item.data();
    if (shift.schedulerSchemaVersion === 3) return false;
    return shift.startTime === '08:00' && shift.endTime === '20:00';
  });
}

export async function removeWeekShifts(weekDays, { tenantId } = {}) {
  ensureFirestoreReady();

  await removeShiftsByDates(weekDays, { tenantId });
}

export async function createManyShifts(shifts, { tenantId } = {}) {
  ensureFirestoreReady();

  if (!Array.isArray(shifts) || !shifts.length) return;
  await commitBatchChunks(shifts, (batch, shift) => {
    batch.set(doc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts)), timestampedPayload(shift, serverTimestamp));
  });
}

export async function replaceShiftsBatch({ tenantId, shiftsToRemove = [], shiftsToCreate = [] }) {
  ensureFirestoreReady();

  const removeItems = (shiftsToRemove || []).filter((shift) => shift?.id).map((shift) => ({ operation: 'delete', shift }));
  const createItems = (shiftsToCreate || []).filter(Boolean).map((shift) => ({ operation: 'create', shift }));
  const operations = [...removeItems, ...createItems];
  const created = [];

  await commitBatchChunks(operations, (batch, item) => {
    if (item.operation === 'delete') {
      batch.delete(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.shifts, item.shift.id));
      return;
    }

    const shiftDoc = doc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.shifts));
    created.push({ id: shiftDoc.id, ...item.shift });
    batch.set(shiftDoc, timestampedPayload(item.shift, serverTimestamp));
  });

  return {
    removed: removeItems.map((item) => item.shift),
    created,
  };
}
