import type {App} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {assertPdfApp} from './pdf-adapters.ts';
import {fail} from './pdf-authorization.ts';
import type {AdmissionDatabase} from './admission.ts';

/** Dedicated demo Firestore adapter: mutation endpoints never instantiate Storage. */
export function createDemoMutationDatabase(app:App,env:Record<string,string|undefined>=process.env):AdmissionDatabase{
  assertPdfApp(app,env);
  const db=getFirestore(app);
  return {transaction:run=>db.runTransaction(async transaction=>{
    let wrote=false;const read=()=>{if(wrote)fail('PDF_INTEGRITY_FAILURE');};
    return run({
      get:async path=>{read();return (await transaction.get(db.doc(path))).data();},
      list:async(path,limit)=>{read();if(!Number.isInteger(limit)||limit<1||limit>1001)fail('PDF_INTEGRITY_FAILURE');
        return (await transaction.get(db.collection(path).limit(limit))).docs.map(row=>({id:row.id,data:row.data()}));},
      set:(path,value)=>{wrote=true;transaction.set(db.doc(path),value);},
      create:(path,value)=>{wrote=true;transaction.create(db.doc(path),value);},
      delete:path=>{wrote=true;transaction.delete(db.doc(path));},
    });
  })};
}
