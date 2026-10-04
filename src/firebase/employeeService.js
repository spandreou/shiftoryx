import {
  addDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  ensureFirestoreReady,
  tenantCollection,
  tenantDoc,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';
import { publicDemoEnabled } from '../demo/config';
import { browserDemoMutationTransport } from '../demo/browserMutationTransport.ts';

const demoRevision = (row) => Number.isSafeInteger(row?.demoRevision) && row.demoRevision >= 0 ? row.demoRevision : 0;

export function subscribeEmployees({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const employeesQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.employees), orderBy('fullName', 'asc'));
  return onSnapshot(
    employeesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createEmployee({ tenantId, ...payload }) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    if (Object.keys(payload).some((key) => !['fullName', 'color', 'isActive', 'schedulerV3'].includes(key))) {
      throw new Error('Το Demo επιτρέπει μόνο δοκιμαστικά στοιχεία εργαζομένου.');
    }
    const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : payload.fullName;
    const result = await browserDemoMutationTransport(tenantId).run('emp.create', { fullName });
    return { id: result.id, ...payload, fullName, demoRevision: 0 };
  }

  const docRef = await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.employees), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function updateEmployee(employeeId, payload, { tenantId } = {}) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    if (Object.keys(payload || {}).some((key) => !['fullName', 'color'].includes(key))) {
      throw new Error('Το Demo επιτρέπει μόνο όνομα και χρώμα εργαζομένου.');
    }
    const snapshot = await getDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.employees, employeeId));
    if (!snapshot.exists()) throw new Error('Ο εργαζόμενος δεν βρέθηκε.');
    await browserDemoMutationTransport(tenantId).run('emp.update', {
      id: employeeId, fullName: typeof payload.fullName === 'string' ? payload.fullName.trim() : payload.fullName, color: payload.color,
      expectedRevision: demoRevision(snapshot.data()),
    });
    return;
  }

  const employeeDoc = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.employees, employeeId);
  await withFirestoreWrite(() =>
    updateDoc(employeeDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeEmployee(employeeId, { tenantId } = {}) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    const snapshot = await getDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.employees, employeeId));
    const client = browserDemoMutationTransport(tenantId);
    const payload = { id: employeeId, expectedRevision: demoRevision(snapshot.data()) };
    if (!snapshot.exists() && !await client.hasPending('emp.delete', payload)) throw new Error('Ο εργαζόμενος δεν βρέθηκε.');
    await client.run('emp.delete', payload);
    return;
  }
  await withFirestoreWrite(() => deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.employees, employeeId)));
}
