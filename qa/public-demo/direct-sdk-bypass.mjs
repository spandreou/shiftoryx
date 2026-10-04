import assert from 'node:assert/strict';
import {doc,setDoc,deleteDoc,getDoc} from 'firebase/firestore';
import {dbAdmin,login,denied,close} from './test-support.mjs';

const tenant='demo-fuel',client=await login(tenant),id='b2-direct-sdk-deny';
const collections=['employees','publicEmployees','absences','settings','scheduleDrafts','shifts',
  'announcements','publicAnnouncements','auditLogs'];
try{
  for(const collection of collections){
    const path=`tenants/${tenant}/${collection}/${id}`;
    const ref=doc(client.db,'tenants',tenant,collection,id);
    await denied(()=>setDoc(ref,{tenantId:tenant,fullName:'Φανταστικός'}));
    await dbAdmin.doc(path).set({tenantId:tenant,fullName:'Φανταστικός',marker:'server-owned'});
    await denied(()=>setDoc(ref,{marker:'browser-overwrite'},{merge:true}));
    await denied(()=>deleteDoc(ref));
    assert.equal((await getDoc(ref)).data().marker,'server-owned',`${collection} must remain unchanged`);
    await dbAdmin.doc(path).delete();
  }
  console.log('PUBLIC_DEMO_DIRECT_SDK_BYPASS_DENIED collections=9 operations=27');
}finally{
  for(const collection of collections)await dbAdmin.doc(`tenants/${tenant}/${collection}/${id}`).delete();
  await close();
}
