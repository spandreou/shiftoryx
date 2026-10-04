// Verify real resumable upload authorization at finalization across a reset.
// Session URLs/tokens remain in memory and are never logged or written.
import assert from 'node:assert/strict';
import {project,login,rpc,bucket,close} from './test-support.mjs';
try{
  const client=await login('demo-cafe'),token=await client.auth.currentUser.getIdToken();
  const objectName='tenants/demo-cafe/schedule-publications/upload-crossing-reset/schedule.pdf',bytes=new TextEncoder().encode('%PDF-fictional-delayed-upload');
  const start=await fetch(`http://127.0.0.1:9408/v0/b/${project}.appspot.com/o?name=${encodeURIComponent(objectName)}`,{method:'POST',headers:{Authorization:'Firebase '+token,'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(bytes.length),'X-Goog-Upload-Header-Content-Type':'application/pdf'},body:JSON.stringify({name:objectName,contentType:'application/pdf'})});
  assert.equal(start.status,200,'authorized old generation can start resumable upload');
  const session=start.headers.get('x-goog-upload-url');assert.ok(session);const target=new URL(session);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'9408');
  assert.equal((await rpc('resetPublicDemo',{tenantId:'demo-cafe'},token)).status,200);
  const finalize=await fetch(session,{method:'POST',headers:{Authorization:'Firebase '+token,'Content-Type':'application/octet-stream','X-Goog-Upload-Command':'upload, finalize','X-Goog-Upload-Offset':'0'},body:bytes});
  const exists=(await bucket.file(objectName).exists())[0];
  console.log(JSON.stringify({scenario:'upload started before reset finalized afterward',finalizeStatus:finalize.status,orphanExists:exists}));
  assert.ok([401,403].includes(finalize.status),'stale upload finalization must be rejected');assert.equal(exists,false,'reset must not gain an orphaned old-generation PDF');
  console.log('DEMO_STORAGE_RESET_RACE_PASS');
}finally{await close();}
