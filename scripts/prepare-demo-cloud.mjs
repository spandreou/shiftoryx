// Narrow setup helper: its target is deliberately fixed to the isolated demo project.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DEMO_PROJECT_ID,DEMO_TENANTS,DEMO_LANDING_ORIGIN} from '../functions/src/public-demo/policy.ts';
const cli=process.env.GCLOUD_PS1;
if(!cli)throw new Error('Set GCLOUD_PS1 to the installed gcloud.ps1.');
const command=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-File',cli,'auth','print-access-token'],{encoding:'utf8',windowsHide:true});
if(command.status!==0)throw new Error('Existing gcloud authentication is unavailable.');
const token=command.stdout.trim();
async function request(url,method='GET',body){
  const parsed=new URL(url);if(!['firebase.googleapis.com','firebasestorage.googleapis.com','identitytoolkit.googleapis.com'].includes(parsed.hostname))throw new Error('Unexpected API origin');
  const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','x-goog-user-project':DEMO_PROJECT_ID},signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw new Error(`Demo API ${r.status}: ${data.error?.status||'request failed'}`);return data;
}
const action=process.argv[2];
if(action==='storage'){
  const bucket=await request(`https://firebasestorage.googleapis.com/v1alpha/projects/${DEMO_PROJECT_ID}/defaultBucket`,'POST',{location:'US-CENTRAL1',storageClass:'STANDARD'});
  console.log('DEMO_STORAGE_BUCKET='+bucket.bucket.name);
}else if(action==='initialize-auth'){
  await request(`https://identitytoolkit.googleapis.com/v2/projects/${DEMO_PROJECT_ID}/identityPlatform:initializeAuth`,'POST',{});
  console.log('DEMO_AUTH_INITIALIZED='+DEMO_PROJECT_ID);
}else if(action==='auth'){
  const authorizedDomains=[new URL(DEMO_LANDING_ORIGIN).hostname,...DEMO_TENANTS.map(t=>t+'.shiftoryx.gr'),DEMO_PROJECT_ID+'.firebaseapp.com'];
  await request(`https://identitytoolkit.googleapis.com/v2/projects/${DEMO_PROJECT_ID}/config?updateMask=authorizedDomains`,'PATCH',{authorizedDomains});
  const config=await request(`https://identitytoolkit.googleapis.com/v2/projects/${DEMO_PROJECT_ID}/config`);
  console.log(JSON.stringify({project:DEMO_PROJECT_ID,authorizedDomains:config.authorizedDomains}));
}else if(action==='client-config'){
  const base=`https://firebase.googleapis.com/v1beta1/projects/${DEMO_PROJECT_ID}`;
  let apps=await request(base+'/webApps');let app=apps.apps?.find(a=>a.displayName==='ShiftOryx Public Demo');
  if(!app){let op=await request(base+'/webApps','POST',{displayName:'ShiftOryx Public Demo'});while(!op.done){if(!/^operations\//.test(op.name))throw new Error('Unexpected demo operation');await new Promise(r=>setTimeout(r,1000));op=await request('https://firebase.googleapis.com/v1beta1/'+op.name);}if(op.error)throw new Error('Demo web app creation failed');app=op.response;}
  const config=await request(base+'/webApps/'+encodeURIComponent(app.appId)+'/config');
  if(config.projectId!==DEMO_PROJECT_ID)throw new Error('Demo web config project mismatch');
  const directory=mkdtempSync(join(tmpdir(),'shiftoryx-demo-cloud-'));
  writeFileSync(join(directory,'client-config.json'),JSON.stringify(config,null,2),{mode:0o600});
  console.log('DEMO_CLIENT_CONFIG_DIRECTORY='+directory);
}else throw new Error('Choose storage, initialize-auth, auth or client-config.');
