// Preparation only: no Firebase initialization, login, network or writes to a tenant.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {realisticTenants,QA_SUITE} from './fixtures.ts';
if(!process.argv[2])throw new Error('Pass an output directory for the reviewable hosted QA manifest.');
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const tenants=realisticTenants().map(t=>({...t,owner:{email:`owner+${t.slug}@example.test`,passwordEnvironmentVariable:'QA_PASSWORD_'+t.slug.slice(3).toUpperCase(),role:'OWNER',status:'ACTIVE'},settings:{schedulerSchemaVersion:3,schedulerConfigV3:t.config}}));
await writeFile(resolve(output,'hosted-qa-manifest.json'),JSON.stringify({qaSuite:QA_SUITE,mode:'PREPARATION_ONLY',requiresHumanAuthorization:true,projectId:null,centralOrigin:'https://shiftoryx.gr',tenants},null,2));
console.log('Hosted QA manifest prepared; no account, tenant, flag or deployment changed.');
