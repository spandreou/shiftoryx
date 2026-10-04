import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as policy from '../functions/src/public-demo/policy.ts';
import * as service from '../functions/src/public-demo/service.ts';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {getApps,initializeApp,deleteApp}=require('firebase-admin/app');

const resolve=policy.resolveDemoResetStorageTarget;
assert.equal(typeof resolve,'function','reset target must be an explicit production policy');

const hosted={PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',GCLOUD_PROJECT:'shiftoryx-public-demo',GOOGLE_CLOUD_PROJECT:'shiftoryx-public-demo'};
assert.deepEqual(resolve(hosted),{projectId:'shiftoryx-public-demo',bucket:'shiftoryx-public-demo.firebasestorage.app'});
console.log('RESET_STORAGE_BUCKET_HOSTED_EXACT=PASS');

const emulator={PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-shiftoryx-public',GOOGLE_CLOUD_PROJECT:'demo-shiftoryx-public',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408'};
assert.deepEqual(resolve(emulator),{projectId:'demo-shiftoryx-public',bucket:'demo-shiftoryx-public.appspot.com'});
console.log('RESET_STORAGE_BUCKET_EMULATOR_EXACT=PASS');

for(const invalid of [
  {...hosted,GCLOUD_PROJECT:'gasstationproject-9dd89'},
  {...hosted,GOOGLE_CLOUD_PROJECT:'gasstationproject-9dd89'},
  {...hosted,PUBLIC_DEMO_PROJECT_ID:'gasstationproject-9dd89'},
  {...hosted,FUNCTIONS_EMULATOR:'true'},
  {...emulator,GCLOUD_PROJECT:'shiftoryx-public-demo'},
  {...emulator,FIREBASE_STORAGE_EMULATOR_HOST:'storage.example.invalid:9408'},
  {...hosted,FIREBASE_STORAGE_EMULATOR_HOST:''},
])assert.throws(()=>resolve(invalid),/DEMO_/);
console.log('RESET_STORAGE_WRONG_PROJECT_DENIED=PASS');

assert.deepEqual(resolve({...hosted,FIREBASE_CONFIG:JSON.stringify({projectId:'gasstationproject-9dd89',storageBucket:'gasstationproject-9dd89.appspot.com'})}),{projectId:'shiftoryx-public-demo',bucket:'shiftoryx-public-demo.firebasestorage.app'});
console.log('RESET_STORAGE_AMBIENT_PRODUCTION_FALLBACK=ABSENT');

const resolveServices=service.resolveDemoResetServices;
assert.equal(typeof resolveServices,'function','reset must consume the explicit target in its Admin SDK app');
const appName='shiftoryx-demo-reset-service';
const hostedServices=resolveServices(hosted);
assert.equal(hostedServices.bucket.name,'shiftoryx-public-demo.firebasestorage.app');
assert.equal(getApps().find(app=>app.name===appName)?.options.projectId,'shiftoryx-public-demo');
await deleteApp(getApps().find(app=>app.name===appName));

const emulatorServices=resolveServices(emulator);
assert.equal(emulatorServices.bucket.name,'demo-shiftoryx-public.appspot.com');
assert.equal(getApps().find(app=>app.name===appName)?.options.projectId,'demo-shiftoryx-public');
await deleteApp(getApps().find(app=>app.name===appName));

const foreignApp=initializeApp({projectId:'gasstationproject-9dd89',storageBucket:'gasstationproject-9dd89.appspot.com'},appName);
assert.throws(()=>resolveServices(hosted),/DEMO_/);
await deleteApp(foreignApp);
console.log('RESET_STORAGE_ADMIN_APP_BOUNDARY=PASS');
