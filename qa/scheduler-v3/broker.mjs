import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {QA_PROJECT,realisticTenants} from './fixtures.ts';
import {assertQaEnvironment,qaEnvironment,endpoints} from './environment.mjs';
Object.assign(process.env,qaEnvironment());assertQaEnvironment();
if(!process.argv[2])throw new Error('Pass the QA runtime directory.');
const output=resolve(process.argv[2]);const accounts=JSON.parse(await readFile(resolve(output,'credentials.json'),'utf8'));const tenants=realisticTenants();
const checks=[];
function check(tenant,scenario,condition){assert.equal(condition,true,tenant+': '+scenario);checks.push({tenant,scenario,result:'PASS'});}
async function call(name,data,origin,idToken){
  const response=await fetch(`http://${endpoints.functions}/${QA_PROJECT}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(idToken?{Authorization:'Bearer '+idToken}:{})},body:JSON.stringify({data})});
  return {status:response.status,body:await response.json()};
}
for(const account of accounts){
  const response=await fetch(`http://${endpoints.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password,returnSecureToken:true})});
  check(account.tenant,'real OWNER authentication',response.ok);const {idToken}=await response.json();
  for(const other of tenants.filter(t=>t.slug!==account.tenant)){
    const attempt=await call('createAuthTicket',{tenantId:other.slug,returnTo:'https://'+other.domain},'https://shiftoryx.gr',idToken);
    check(account.tenant,'broker denies requested tenant '+other.slug,attempt.status===403);
  }
  const own='https://'+account.domain;
  const created=await call('createAuthTicket',{tenantId:account.tenant,returnTo:own},'https://shiftoryx.gr',idToken);
  check(account.tenant,'ticket bound to authorized tenant',created.status===200&&new URL(created.body.result.redirectUrl).origin===own);
  const ticket=new URLSearchParams(new URL(created.body.result.redirectUrl).hash.slice(1)).get('authTicket');
  const foreign='https://'+tenants.find(t=>t.slug!==account.tenant).domain;
  const wrongOrigin=await call('exchangeAuthTicket',{ticket},foreign);
  check(account.tenant,'ticket cannot be exchanged at another tenant origin',wrongOrigin.status===403);
  const exchanged=await call('exchangeAuthTicket',{ticket},own);
  check(account.tenant,'correct tenant exchange succeeds',exchanged.status===200&&exchanged.body.result.tenantId===account.tenant&&!!exchanged.body.result.customToken);
  const replay=await call('exchangeAuthTicket',{ticket},own);
  check(account.tenant,'single-use ticket replay denied',replay.status===403);
}
await writeFile(resolve(output,'broker-results.json'),JSON.stringify({assertions:checks.length,checks},null,2));
console.log(`REALISTIC_BROKER assertions=${checks.length} PASS`);
