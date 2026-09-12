import {QA_PROJECT} from './fixtures.ts';
export const endpoints={auth:'127.0.0.1:9298',firestore:'127.0.0.1:8187',storage:'127.0.0.1:9398',functions:'127.0.0.1:5101'};
export function assertQaEnvironment(env=process.env){
  if(env.GCLOUD_PROJECT!==QA_PROJECT)throw new Error('QA requires the fixed demo project.');
  for(const [key,value] of Object.entries({FIREBASE_AUTH_EMULATOR_HOST:endpoints.auth,FIRESTORE_EMULATOR_HOST:endpoints.firestore,FIREBASE_STORAGE_EMULATOR_HOST:endpoints.storage}))if(env[key]!==value)throw new Error('QA requires explicit loopback emulator endpoints.');
}
export function qaEnvironment(){return {GCLOUD_PROJECT:QA_PROJECT,GOOGLE_CLOUD_PROJECT:QA_PROJECT,FIREBASE_AUTH_EMULATOR_HOST:endpoints.auth,FIRESTORE_EMULATOR_HOST:endpoints.firestore,FIREBASE_STORAGE_EMULATOR_HOST:endpoints.storage,AUTH_BROKER_BASE_DOMAIN:'shiftoryx.gr',AUTH_BROKER_CENTRAL_DOMAIN:'shiftoryx.gr'};}
