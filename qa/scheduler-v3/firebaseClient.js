// Loaded only by the explicit QA Vite config. Never imported by production code.
import {initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
import {getStorage,connectStorageEmulator} from 'firebase/storage';
import {getFunctions,connectFunctionsEmulator} from 'firebase/functions';
const projectId='demo-shiftoryx-realistic';
export const app=initializeApp({projectId,apiKey:'demo-only-not-a-real-key',authDomain:projectId+'.firebaseapp.com',storageBucket:projectId+'.appspot.com',appId:'demo-app'});
export const auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),functions=getFunctions(app,'us-central1');
connectAuthEmulator(auth,'http://127.0.0.1:9298',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8187);
connectStorageEmulator(storage,'127.0.0.1',9398);
connectFunctionsEmulator(functions,'127.0.0.1',5101);
export const analytics=null,isFirebaseConfigured=true,missingFirebaseEnvKeys=[],firebaseConfigErrorMessage='';
export const appMode='production',isDemoMode=false,adminEmail='',isAdminEmailConfigured=false;
export const isMonthlyPdfArchiveEnabled=false,isAuthBrokerEnabled=true;
