// Public Firebase Auth clients can delete their own shared demo Auth user.
// The next ordinary entry must recover its claims without changing membership.
import assert from 'node:assert/strict';
import {deleteUser,signInWithCustomToken} from 'firebase/auth';
import {doc,getDoc} from 'firebase/firestore';
import {login,rpc,close,dbAdmin,authAdmin} from './test-support.mjs';
try{
  const first=await login('demo-fuel'),uid=first.auth.currentUser.uid,member=dbAdmin.doc(`tenantMemberships/${uid}_demo-fuel`),original=(await member.get()).data();await deleteUser(first.auth.currentUser);
  try{
    for(const patch of [{uid:'foreign-owner'},{tenantId:'demo-cafe'},{role:'MANAGER'},{status:'REVOKED'}]){
      await member.set({...original,...patch});assert.equal((await rpc('enterPublicDemo',{tenantId:'demo-fuel'})).status,403);
      await assert.rejects(()=>authAdmin.getUser(uid),error=>error.code==='auth/user-not-found','entry must not repair an identity without valid membership');
    }
  }finally{await member.set(original);}
  const next=await login('demo-fuel');
  const issued=await rpc('createAuthTicket',{tenantId:'demo-fuel',returnTo:'https://demo-fuel.shiftoryx.gr'},await next.auth.currentUser.getIdToken());assert.equal(issued.status,200);
  const fragment=new URL(issued.result.redirectUrl).hash.slice(1),ticket=new URLSearchParams(fragment).get('authTicket');assert.ok(ticket);
  const exchanged=await rpc('exchangeAuthTicket',{ticket},null,'https://demo-fuel.shiftoryx.gr');assert.equal(exchanged.status,200);
  await signInWithCustomToken(next.auth,exchanged.result.customToken);
  assert.equal((await next.auth.currentUser.getIdTokenResult()).claims.publicDemo,true,'broker must retain demo claims after shared UID self-delete/recreation');
  assert.equal((await getDoc(doc(next.db,'tenants','demo-fuel','employees','demo-fuel-e1'))).exists(),true);
  console.log('DEMO_SHARED_IDENTITY_RECOVERY_PASS');
}finally{await close();}
