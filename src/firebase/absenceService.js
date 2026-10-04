import {
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  ensureFirestoreReady,
  tenantCollection,
  tenantDoc,
  timestampedPayload,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';
import { publicDemoEnabled } from '../demo/config';
import { browserDemoMutationTransport } from '../demo/browserMutationTransport.ts';

const absenceFields = ['employeeId', 'type', 'startDate', 'endDate', 'scope', 'replacementMode',
  'manualReplacementEmployeeId', 'note', 'status'];
const demoRevision = (row) => Number.isSafeInteger(row?.demoRevision) && row.demoRevision >= 0 ? row.demoRevision : 0;
function demoAbsencePayload(value) {
  const scope = value.scope || 'FULL_DAY', status = value.status || 'ACTIVE';
  return {
    employeeId: value.employeeId,
    type: value.type,
    startDate: value.startDate,
    endDate: value.endDate,
    scope: ['PARTIAL_DAY', 'MORNING_ONLY', 'INTERMEDIATE_ONLY', 'AFTERNOON_ONLY', 'SUNDAY_12H_ONLY'].includes(scope)
      ? 'PARTIAL_DAY' : scope,
    replacementMode: value.replacementMode || 'AUTO',
    manualReplacementEmployeeId: value.manualReplacementEmployeeId || '',
    note: typeof value.note === 'string' ? value.note.trim() : value.note || '',
    status: status === 'ACTIVE' ? 'APPROVED' : status,
  };
}

export function subscribeEmployeeAbsences({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const absencesQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.absences), orderBy('startDate', 'asc'));
  return onSnapshot(
    absencesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export function subscribePublicEmployeeAbsences(_options, onData) {
  onData?.([]);
  return createLocalUnsubscribe();
}

export async function createEmployeeAbsence({ tenantId, ...payload }) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    if (Object.keys(payload).some((key) => ![...absenceFields, 'employeeName', 'createdBy', 'updatedBy'].includes(key))) {
      throw new Error('Μη έγκυρα στοιχεία απουσίας Demo.');
    }
    const normalized = demoAbsencePayload(payload);
    const result = await browserDemoMutationTransport(tenantId).run('abs.create', normalized);
    return { id: result.id, ...normalized, demoRevision: 0 };
  }
  const privateRef = doc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.absences));
  const privatePayload = {
    ...payload,
    status: payload.status || 'ACTIVE',
    scope: payload.scope || 'FULL_DAY',
  };

  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.set(privateRef, timestampedPayload(privatePayload, serverTimestamp));
    return batch.commit();
  });

  return { id: privateRef.id, ...privatePayload };
}

export async function updateEmployeeAbsence(absenceId, patch, { tenantId } = {}) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    if (Object.keys(patch || {}).some((key) => ![...absenceFields, 'employeeName', 'updatedBy'].includes(key))) {
      throw new Error('Μη έγκυρα στοιχεία απουσίας Demo.');
    }
    const snapshot = await getDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.absences, absenceId));
    if (!snapshot.exists()) throw new Error('Η απουσία δεν βρέθηκε.');
    await browserDemoMutationTransport(tenantId).run('abs.update', {
      id: absenceId, ...demoAbsencePayload({ ...snapshot.data(), ...patch }),
      expectedRevision: demoRevision(snapshot.data()),
    });
    return;
  }
  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.update(
      tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.absences, absenceId),
      timestampedPayload({ ...patch }, serverTimestamp, { includeCreatedAt: false }),
    );
    return batch.commit();
  });
}

export async function cancelEmployeeAbsence(absenceId, { tenantId } = {}) {
  return updateEmployeeAbsence(absenceId, { status: 'CANCELLED' }, { tenantId });
}

export async function removeEmployeeAbsence(absenceId, { tenantId } = {}) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    const snapshot = await getDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.absences, absenceId));
    const client = browserDemoMutationTransport(tenantId);
    const payload = { id: absenceId, expectedRevision: demoRevision(snapshot.data()) };
    if (!snapshot.exists() && !await client.hasPending('abs.delete', payload)) throw new Error('Η απουσία δεν βρέθηκε.');
    await client.run('abs.delete', payload);
    return;
  }
  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.delete(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.absences, absenceId));
    return batch.commit();
  });
}
