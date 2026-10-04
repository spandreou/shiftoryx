import {
  addDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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

export function subscribeAnnouncements({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const announcementsQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.announcements), orderBy('createdAt', 'desc'));
  return onSnapshot(
    announcementsQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createAnnouncement({ tenantId, ...payload }) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    if (Object.keys(payload).some((key) => !['title', 'body', 'authorEmail'].includes(key))) {
      throw new Error('Μη έγκυρα στοιχεία ανακοίνωσης Demo.');
    }
    const normalized = {
      title: typeof payload.title === 'string' ? payload.title.trim() : payload.title,
      body: typeof payload.body === 'string' ? payload.body.trim() : payload.body,
    };
    const result = await browserDemoMutationTransport(tenantId).run('ann.create', normalized);
    return { id: result.id, ...normalized, demoRevision: 0 };
  }

  const docRef = await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.announcements), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function removeAnnouncement(announcementId, { tenantId } = {}) {
  ensureFirestoreReady();
  if (publicDemoEnabled) {
    const snapshot = await getDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.announcements, announcementId));
    const revision = Number.isSafeInteger(snapshot.data()?.demoRevision) && snapshot.data().demoRevision >= 0
      ? snapshot.data().demoRevision : 0;
    const client = browserDemoMutationTransport(tenantId), payload = { id: announcementId, expectedRevision: revision };
    if (!snapshot.exists() && !await client.hasPending('ann.delete', payload)) throw new Error('Η ανακοίνωση δεν βρέθηκε.');
    await client.run('ann.delete', payload);
    return;
  }
  await withFirestoreWrite(() => deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.announcements, announcementId)));
}
