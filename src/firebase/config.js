import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

function getEnvValue(name) {
  const value = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env[name]
    : (typeof process !== 'undefined' && process.env ? process.env[name] : '');
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStorageBucket(value) {
  if (!value) return '';

  // Accept inputs like:
  // - gasstationproject-xxxx.appspot.com
  // - gasstationproject-xxxx.firebasestorage.app
  // - gs://gasstationproject-xxxx.appspot.com
  // - https://gasstationproject-xxxx.appspot.com
  const raw = value
    .replace(/^gs:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .trim();

  return raw;
}

const firebaseEnv = {
  apiKey: getEnvValue('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvValue('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvValue('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: normalizeStorageBucket(getEnvValue('VITE_FIREBASE_STORAGE_BUCKET')),
  messagingSenderId: getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvValue('VITE_FIREBASE_APP_ID'),
  measurementId: getEnvValue('VITE_FIREBASE_MEASUREMENT_ID'),
};

export const missingFirebaseEnvKeys = REQUIRED_FIREBASE_ENV_KEYS.filter((key) => !getEnvValue(key));
export const isFirebaseConfigured = missingFirebaseEnvKeys.length === 0;

export const appMode = (getEnvValue('VITE_APP_MODE') || 'production').toLowerCase();
export const isDemoMode = appMode !== 'production';
export const adminEmail = getEnvValue('VITE_ADMIN_EMAIL').toLowerCase();
export const isAdminEmailConfigured = Boolean(adminEmail);

export const firebaseConfigErrorMessage = isFirebaseConfigured
  ? ''
  : `Το Firebase δεν είναι ρυθμισμένο. Λείπουν env vars: ${missingFirebaseEnvKeys.join(', ')}`;

if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && !isFirebaseConfigured) {
  console.error(firebaseConfigErrorMessage);
}

const firebaseConfig = isFirebaseConfigured
  ? {
      apiKey: firebaseEnv.apiKey,
      authDomain: firebaseEnv.authDomain,
      projectId: firebaseEnv.projectId,
      storageBucket: firebaseEnv.storageBucket,
      messagingSenderId: firebaseEnv.messagingSenderId,
      appId: firebaseEnv.appId,
      measurementId: firebaseEnv.measurementId || undefined,
    }
  : null;

const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;
const functions = app ? getFunctions(app, 'us-central1') : null;
const storage = app ? getStorage(app, `gs://${firebaseEnv.storageBucket}`) : null;
let analytics = null;

if (typeof window !== 'undefined' && app && getEnvValue('VITE_PUBLIC_DEMO_ENABLED') !== 'true') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
}

function getEnvFlag(name, fallback = false) {
  const value = getEnvValue(name).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export const isMonthlyPdfArchiveEnabled = getEnvFlag('VITE_ENABLE_MONTHLY_PDF_ARCHIVE', false);
export const isAuthBrokerEnabled = getEnvFlag('VITE_ENABLE_AUTH_BROKER', false);

export { analytics, app, auth, db, functions, storage };
